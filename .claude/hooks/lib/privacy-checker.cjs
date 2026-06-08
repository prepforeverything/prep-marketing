const path = require("path");

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\?/g, "[^/]")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

const SAFE_SUFFIXES = /\.(example|sample|template|dist)$/i;

// Tools that read whole files via a single path arg.
const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS"]);
// Tools that write to a single path arg.
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Bash subcommand classification.
// `find` has its own dedicated parser (see parseFindArgs) because its option
// semantics — search-literal operands (`-name`, `-path`, `-regex`) vs
// real-file operands (`-newer`, `-fprint`) — are too involved for the
// shared pattern-tool path. Listed here only for `grep`-family and `rg`-style
// regex-and-pathlist tools.
const BASH_PATTERN_OPERAND_TOOLS = new Set([
  "grep", "egrep", "fgrep", "rg", "ripgrep", "ag", "ack"
]);
// "Internal-read" Bash tools: their stdout lands in the agent's tool result
// (i.e., already inside the local session context), not in any external
// system. Touching a sensitive file with these is informational, not a leak —
// the user is typically running `cat .env | grep KEY` for local debug while
// the runtime already has the keys loaded. We still flag the match (so
// callers can advise) but downgrade the result to advisory rather than a
// hard block. Exfiltration paths (curl/wget/scp/aws/gcloud/nc/...) are not
// in this set and continue to be evaluated by the standard rules; write
// candidates (>/>>/tee/cp dest/sed -i/...) also continue to block.
const BASH_READ_TOOLS = new Set([
  "cat", "head", "tail", "less", "more", "od", "hexdump", "xxd", "wc",
  "file", "stat", "md5sum", "sha1sum", "sha256sum"
]);

// find-specific option semantics (per `man find` POSIX + GNU extensions).
// Operands following these options are SEARCH LITERALS — they are not files
// that find reads, just shell-glob patterns/regex strings that find matches
// against discovered names. We MUST skip them so commands like
// `find . -name ".env.production"` do not blow up the privacy gate when the
// user is searching FOR sensitive files (a legitimate audit workflow).
const FIND_SEARCH_LITERAL_OPTS = new Set([
  "-name", "-iname",
  "-path", "-ipath",
  "-regex", "-iregex",
  "-lname", "-ilname",
  "-wholename"
]);

// Operands following these options ARE real-file references (paths find
// reads or compares against). Treat as read candidates so audit attempts
// like `find . -newer .env.production` still block.
const FIND_READ_OPERAND_OPTS = new Set([
  "-newer", "-cnewer", "-anewer", "-samefile"
]);

// Operands following these options are write targets (find writes match
// output to the named file). Treat as write candidates.
const FIND_WRITE_OPERAND_OPTS = new Set([
  "-fprint", "-fprintf", "-fls"
]);

// Single-operand options whose value is metadata (time, size, type, etc.) —
// not a file reference. Skip the operand entirely.
const FIND_SKIP_OPERAND_OPTS = new Set([
  "-mtime", "-atime", "-ctime",
  "-mmin", "-amin", "-cmin",
  "-type", "-xtype",
  "-size", "-perm",
  "-user", "-group", "-uid", "-gid",
  "-maxdepth", "-mindepth",
  "-inum", "-links",
  "-fstype",
  "-newerXY", // catch-all family — best-effort
  "-anewer", "-cnewer", "-newer", "-samefile" // already handled but harmless
]);

// Zero-operand options (flags only). Listed for clarity; the parser skips
// any leading `-` token whose name is not in the other sets, so missing
// entries here are non-fatal.
const FIND_NO_OPERAND_OPTS = new Set([
  "-nouser", "-nogroup",
  "-empty", "-readable", "-writable", "-executable",
  "-prune", "-print", "-print0", "-printf", "-ls",
  "-quit", "-true", "-false",
  "-depth", "-follow", "-mount", "-xdev",
  "-L", "-P", "-H", "-O"
]);

// `-exec` / `-execdir` / `-ok` / `-okdir` consume operands up to a `;` or
// `+` terminator. The body is treated as an ACCEPTED GAP — we do NOT
// recursively scan a nested command line. Documented in codex MEDIUM#1.
const FIND_EXEC_OPTS = new Set([
  "-exec", "-execdir", "-ok", "-okdir"
]);

const FIND_EXEC_TERMINATORS = new Set([";", "+"]);

/**
 * Decode ANSI-C escape sequences inside a `$'...'` body (codex iter-4 HIGH-G).
 *
 * Bash `$'...'` strings support C-style escapes that decode at parse time, so
 * `$'\x2eenv.production'` is byte-equivalent to `.env.production`. The
 * privacy parser must apply the same decoding before pattern matching or the
 * sensitive bytes never reach the matcher.
 *
 * Supported escapes (per Bash man "QUOTING"):
 *   - `\n` `\t` `\r` `\b` `\f` `\v` `\a` `\\` `\'` `\"` `\?` (basic)
 *   - `\xNN` `\xN` (hex byte; 1-2 hex digits)
 *   - `\NNN` `\NN` `\N` (octal byte; 1-3 octal digits)
 *   - `\uXXXX` (BMP Unicode code point — encoded back to UTF-8 by JS string
 *     concatenation; this matches the byte-level intent for filename matching)
 *   - `\UXXXXXXXX` (1-8 hex digits — full Unicode code point via
 *     `String.fromCodePoint`; codex iter-5 HIGH-N)
 *
 * Any malformed escape sequence (e.g. `\x` with no following hex digits) is
 * preserved literally so the function never throws. This is intentional —
 * the privacy gate must not crash on adversarial input.
 */
function decodeAnsiCEscapes(body) {
  if (!body || body.indexOf("\\") < 0) return body;
  let out = "";
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c !== "\\" || i + 1 >= n) {
      out += c;
      i++;
      continue;
    }
    const next = body[i + 1];
    // Simple single-char escapes.
    const SIMPLE = {
      "n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
      "v": "\v", "a": "\x07", "\\": "\\", "'": "'", "\"": "\"",
      "?": "?", "e": "\x1b", "E": "\x1b"
    };
    if (SIMPLE[next] !== undefined) {
      out += SIMPLE[next];
      i += 2;
      continue;
    }
    // Hex byte: `\xNN` or `\xN` (1-2 hex digits).
    if (next === "x") {
      let j = i + 2;
      let hex = "";
      while (hex.length < 2 && j < n && /[0-9a-fA-F]/.test(body[j])) {
        hex += body[j];
        j++;
      }
      if (hex.length > 0) {
        out += String.fromCharCode(parseInt(hex, 16));
        i = j;
        continue;
      }
      // Malformed `\x` — preserve literally and continue (defensive).
      out += "\\x";
      i += 2;
      continue;
    }
    // BMP Unicode: `\uXXXX` (4 hex digits exactly).
    if (next === "u") {
      let j = i + 2;
      let hex = "";
      while (hex.length < 4 && j < n && /[0-9a-fA-F]/.test(body[j])) {
        hex += body[j];
        j++;
      }
      if (hex.length === 4) {
        out += String.fromCharCode(parseInt(hex, 16));
        i = j;
        continue;
      }
      // Malformed `\u` — preserve.
      out += "\\u";
      i += 2;
      continue;
    }
    // Full Unicode: `\UXXXXXXXX` (1-8 hex digits; codex iter-5 HIGH-N).
    // Bash accepts 1 to 8 hex digits and decodes via the wider code point.
    if (next === "U") {
      let j = i + 2;
      let hex = "";
      while (hex.length < 8 && j < n && /[0-9a-fA-F]/.test(body[j])) {
        hex += body[j];
        j++;
      }
      if (hex.length > 0) {
        const code = parseInt(hex, 16);
        // String.fromCodePoint throws RangeError for code > 0x10FFFF.
        if (code <= 0x10FFFF) {
          out += String.fromCodePoint(code);
          i = j;
          continue;
        }
      }
      // Malformed `\U` (no hex digits or code point out of range) — preserve.
      out += "\\U";
      i += 2;
      continue;
    }
    // Octal byte: `\NNN` `\NN` `\N` (1-3 octal digits). Bash also accepts the
    // `\0NNN` form (leading 0); we treat the leading 0 as one of the digits.
    if (/[0-7]/.test(next)) {
      let j = i + 1;
      let oct = "";
      while (oct.length < 3 && j < n && /[0-7]/.test(body[j])) {
        oct += body[j];
        j++;
      }
      if (oct.length > 0) {
        const code = parseInt(oct, 8);
        if (code <= 0xff) {
          out += String.fromCharCode(code);
          i = j;
          continue;
        }
      }
      // Fallthrough.
    }
    // Unknown escape: preserve literally.
    out += c + next;
    i += 2;
  }
  return out;
}

/**
 * Strip shell quoting and the leading "./" prefix from a token, and apply
 * Bash "quote removal" semantics for backslash escapes per POSIX shell rules
 * (codex iter-2 HIGH-D + MEDIUM-4).
 *
 * Supports concatenated shell-word fragments produced by tokenizeBash, e.g.
 * `.env.''production` → `.env.production` and `"foo".env.production` →
 * `foo.env.production`. Walks the token left-to-right, copying unquoted text
 * verbatim and stripping the surrounding quote pair from each quoted segment.
 *
 * Backslash handling per Bash man page "QUOTING":
 *   - Outside quotes: `\X` → `X` (backslash is removed; X is preserved
 *     literally, including operator chars like `;` `&` etc.)
 *   - Inside single quotes: backslash has NO special meaning; preserved as-is.
 *   - Inside double quotes: backslash is special only before `$`, `` ` ``,
 *     `"`, `\`, or newline. Otherwise the backslash STAYS literal.
 *   - `$'...'` (ANSI-C): backslash decodes C-style escapes via
 *     decodeAnsiCEscapes (codex iter-4 HIGH-G).
 *   - `$"..."` (locale translation): strip the leading `$`, treat as a
 *     normal double-quoted segment (codex iter-4 HIGH-G).
 *
 * This is the standard shell "quote removal" pass, applied after tokenization
 * but before pattern matching. Required to defeat the `cat .env\.production`
 * bypass class (HIGH-D), the `f=.env.production\;cat $f` false-positive
 * (MEDIUM-4), and the `cat $'.env.production'` / `cat $".env.production"`
 * bypass classes (HIGH-G).
 */
function unquoteToken(tok) {
  if (!tok) return tok;

  // Walk the token, tracking quote state so backslash handling matches Bash
  // semantics. The single-fragment case (`"foo"` → `foo`) and multi-fragment
  // concatenations (e.g. `.env.''production` → `.env.production`) are handled
  // uniformly because we copy each segment's content into the output.
  let out = "";
  let i = 0;
  const n = tok.length;
  // Characters that are escapable inside double quotes (Bash man "QUOTING").
  // Any other char following a backslash inside `"..."` retains the literal
  // backslash.
  const DQ_ESCAPABLE = new Set(["$", "`", "\"", "\\", "\n"]);
  while (i < n) {
    const ch = tok[i];
    // ANSI-C `$'...'` and locale `$"..."` quote forms (codex iter-4 HIGH-G).
    // Tokenizer keeps the leading `$` attached to the opening quote so we can
    // distinguish these from a bare `$'...'` (rare) or unquoted text. We
    // recognize the form here in unquoteToken so concatenated forms like
    // `prefix$'suffix'` still decode correctly.
    if (ch === "$" && i + 1 < n && (tok[i + 1] === "'" || tok[i + 1] === "\"")) {
      const q = tok[i + 1];
      if (q === "'") {
        // ANSI-C: locate closing quote, honoring backslash-escaped `\'`.
        let j = i + 2;
        while (j < n) {
          if (tok[j] === "\\" && j + 1 < n) { j += 2; continue; }
          if (tok[j] === "'") break;
          j++;
        }
        const body = tok.slice(i + 2, j);
        out += decodeAnsiCEscapes(body);
        i = j < n ? j + 1 : j;
        continue;
      }
      // Locale-translation `$"..."`: strip the leading `$` and re-enter the
      // loop at the `"` so the standard double-quote branch handles it.
      i++;
      continue;
    }
    if (ch === "'") {
      // Single-quoted segment: copy everything literally (no escapes).
      const start = i + 1;
      let j = start;
      while (j < n && tok[j] !== "'") j++;
      out += tok.slice(start, j);
      i = j < n ? j + 1 : j;
      continue;
    }
    if (ch === "\"") {
      // Double-quoted segment: process backslash escapes per Bash rules.
      i++;
      while (i < n && tok[i] !== "\"") {
        const c = tok[i];
        if (c === "\\" && i + 1 < n && DQ_ESCAPABLE.has(tok[i + 1])) {
          // Drop the backslash, keep the escaped char.
          out += tok[i + 1];
          i += 2;
          continue;
        }
        out += c;
        i++;
      }
      // Skip the closing quote (or end-of-string when unclosed).
      if (i < n) i++;
      continue;
    }
    // Unquoted segment: backslash escapes any following char (just drop the
    // backslash). This is "quote removal" — the standard Bash step that
    // turns `\;` into `;`, `\.` into `.`, etc.
    if (ch === "\\" && i + 1 < n) {
      out += tok[i + 1];
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }

  // Drop leading ./
  if (out.startsWith("./")) {
    out = out.slice(2);
  }
  return out;
}

/**
 * Locate the first UNQUOTED `{` in a token that starts a valid `{a,b,...}`
 * brace expansion. Returns `{ open, close }` indices, or null if no such
 * expansion exists. Quoted spans (`'...'`, `"..."`, `$'...'`, `$"..."`) and
 * `$(...)` / backtick blocks are skipped — braces inside them are literal
 * (codex iter-4 MED-6).
 *
 * Validity rule mirrors findBraceExpansionEnd: matching `}` must exist AND
 * at least one TOP-LEVEL UNQUOTED comma must appear inside the braces.
 */
function findUnquotedBraceExpansion(token) {
  const n = token.length;
  let i = 0;
  while (i < n) {
    const c = token[i];
    // Skip backslash-escaped char.
    if (c === "\\" && i + 1 < n) { i += 2; continue; }
    // Skip ANSI-C / locale quotes `$'...'` / `$"..."`.
    if (c === "$" && i + 1 < n && (token[i + 1] === "'" || token[i + 1] === "\"")) {
      const q = token[i + 1];
      i += 2;
      while (i < n) {
        if (token[i] === "\\" && i + 1 < n) { i += 2; continue; }
        if (token[i] === q) break;
        i++;
      }
      if (i < n) i++;
      continue;
    }
    // Skip single-quoted span.
    if (c === "'") {
      i++;
      while (i < n && token[i] !== "'") i++;
      if (i < n) i++;
      continue;
    }
    // Skip double-quoted span.
    if (c === "\"") {
      i++;
      while (i < n && token[i] !== "\"") {
        if (token[i] === "\\" && i + 1 < n) { i += 2; continue; }
        i++;
      }
      if (i < n) i++;
      continue;
    }
    // Skip `$(...)` block.
    if (c === "$" && i + 1 < n && token[i + 1] === "(") {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (token[i] === "(") depth++;
        else if (token[i] === ")") depth--;
        if (depth > 0) i++;
      }
      if (i < n) i++;
      continue;
    }
    // Skip backtick block.
    if (c === "`") {
      i++;
      while (i < n && token[i] !== "`") i++;
      if (i < n) i++;
      continue;
    }
    if (c === "{") {
      // Try to find matching `}` at the same unquoted depth, requiring at
      // least one top-level unquoted comma.
      const openIdx = i;
      let depth = 1;
      let hasTopComma = false;
      i++;
      while (i < n && depth > 0) {
        const d = token[i];
        if (d === "\\" && i + 1 < n) { i += 2; continue; }
        if (d === "'") {
          i++;
          while (i < n && token[i] !== "'") i++;
          if (i < n) i++;
          continue;
        }
        if (d === "\"") {
          i++;
          while (i < n && token[i] !== "\"") {
            if (token[i] === "\\" && i + 1 < n) { i += 2; continue; }
            i++;
          }
          if (i < n) i++;
          continue;
        }
        if (d === "$" && i + 1 < n && token[i + 1] === "(") {
          i += 2;
          let dpth = 1;
          while (i < n && dpth > 0) {
            if (token[i] === "(") dpth++;
            else if (token[i] === ")") dpth--;
            if (dpth > 0) i++;
          }
          if (i < n) i++;
          continue;
        }
        if (d === "`") {
          i++;
          while (i < n && token[i] !== "`") i++;
          if (i < n) i++;
          continue;
        }
        if (d === "{") { depth++; i++; continue; }
        if (d === "}") {
          depth--;
          if (depth === 0) {
            if (hasTopComma) return { open: openIdx, close: i };
            // No comma at this level — keep scanning past this brace pair.
            i++;
            break;
          }
          i++;
          continue;
        }
        if (d === "," && depth === 1) hasTopComma = true;
        i++;
      }
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Expand simple `{a,b,c}` brace constructs into N candidate strings (codex
 * iter-2 HIGH-E + iter-4 MED-6).
 *
 * Returns an array of expansions for the given token. Supports comma-separated
 * literal alternatives nested at depth 1:
 *   `.env.{production,prod}` → [`.env.production`, `.env.prod`]
 *   `foo.{pem,key}`          → [`foo.pem`, `foo.key`]
 *   `a{b,c}d{e,f}`           → [`abde`, `abdf`, `acde`, `acdf`]
 *
 * IMPORTANT: this function operates on the RAW (still-quoted) token and only
 * expands braces that appear in UNQUOTED spans. Quoted braces stay literal —
 * `".env.{production,prod}"` does NOT expand because the braces are inside
 * double quotes. This is the codex iter-4 MED-6 fix.
 *
 * Documented gaps (accepted limitations):
 *   - Sequence expansion `{1..10}` is NOT supported — too rare for filenames
 *     and adds parser complexity. The original token is returned unchanged.
 *   - Empty braces `{}` are NOT recognized as expansion — returned unchanged.
 *   - Nested braces ARE supported via recursion on each alternative.
 *
 * When no expansion applies, returns `[token]` (single-element array) so the
 * caller can iterate uniformly.
 */
function expandSimpleBraces(token) {
  if (!token || typeof token !== "string") return [token];
  // Fast path: no `{` means nothing to expand.
  if (!token.includes("{")) return [token];

  const found = findUnquotedBraceExpansion(token);
  if (!found) return [token];
  const { open, close } = found;

  const prefix = token.slice(0, open);
  const suffix = token.slice(close + 1);
  const body = token.slice(open + 1, close);

  // Split body on top-level UNQUOTED commas (depth-aware, quote-aware).
  const parts = [];
  let buf = "";
  let d = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) { buf += body.slice(i, i + 2); i += 2; continue; }
    if (c === "'") {
      const start = i;
      i++;
      while (i < body.length && body[i] !== "'") i++;
      if (i < body.length) i++;
      buf += body.slice(start, i);
      continue;
    }
    if (c === "\"") {
      const start = i;
      i++;
      while (i < body.length && body[i] !== "\"") {
        if (body[i] === "\\" && i + 1 < body.length) { i += 2; continue; }
        i++;
      }
      if (i < body.length) i++;
      buf += body.slice(start, i);
      continue;
    }
    if (c === "{") { d++; buf += c; i++; continue; }
    if (c === "}") { d--; buf += c; i++; continue; }
    if (c === "," && d === 0) {
      parts.push(buf);
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  parts.push(buf);

  // Recursively expand suffix first (so any nested braces in trailing text
  // expand correctly), then combine each alternative with the recursive
  // expansion of itself.
  const suffixExpansions = expandSimpleBraces(suffix);
  const out = [];
  for (const part of parts) {
    const partExpansions = expandSimpleBraces(part);
    for (const pe of partExpansions) {
      for (const se of suffixExpansions) {
        out.push(prefix + pe + se);
      }
    }
  }
  return out.length > 0 ? out : [token];
}

/**
 * Tokenize a Bash command into shell-like tokens, preserving quoted segments
 * as single tokens (with quotes attached, so callers can decide whether to
 * treat the contents as a pattern literal vs path).
 *
 * Conservatively concatenates adjacent fragments separated only by quote
 * boundaries (no intervening whitespace). This collapses shell-word
 * constructions like `.env.''production`, `"foo".env.production`, and
 * `'.env'.production` into a single token before pattern matching. This is a
 * best-effort defense against the "split-with-quotes" bypass class — it does
 * NOT attempt full POSIX shell parsing. `$(...)` and backticks remain
 * unscanned (accepted risk; see codex-review-delivery.md HIGH#3).
 */
// Shell operator characters that always terminate a word and emit standalone
// (or contiguous-operator-run) tokens. Includes redirection operators (`<`,
// `>`) and grouping operators (`(`, `)`, `{`, `}`) so wrapping a command in
// `(...)` or `{ ...; }` cannot smuggle bytes into argv0. Brace groups MUST
// have whitespace around them in real Bash to be recognized — we treat them
// as boundaries unconditionally because our defensive intent is to never
// let a `{` or `}` glue to a sensitive path.
const OPERATOR_CHARS = new Set([";", "&", "|", "(", ")", "{", "}", "<", ">"]);

function isOperatorChar(c) {
  return OPERATOR_CHARS.has(c);
}

/**
 * If `cmd[openIdx]` is `{` and begins a valid `{a,b,...}` brace expansion,
 * return the index of the matching `}`. Otherwise return -1 (caller falls
 * back to grouping-operator semantics).
 *
 * "Valid" means: matching `}` is found AND at least one top-level comma is
 * present inside the braces. Sequence form `{N..M}` (no comma) is NOT
 * recognized — that's a documented gap.
 *
 * Brace depth is tracked so `{a,{b,c}}` matches the OUTER closer. Quotes
 * inside the body are respected (a comma inside `"..."` does NOT count as a
 * top-level comma). This prevents `{ "a,b" }` from being mis-detected when
 * the body has no real expansion (it would still find a comma but the comma
 * is inside quotes).
 *
 * Codex iter-4 HIGH-H — leading brace expansion fix.
 */
function findBraceExpansionEnd(cmd, openIdx) {
  if (cmd[openIdx] !== "{") return -1;
  const n = cmd.length;
  let depth = 1;
  let hasTopComma = false;
  let i = openIdx + 1;
  while (i < n && depth > 0) {
    const c = cmd[i];
    if (c === "\\" && i + 1 < n) { i += 2; continue; }
    if (c === "'") {
      i++;
      while (i < n && cmd[i] !== "'") i++;
      if (i < n) i++;
      continue;
    }
    if (c === "\"") {
      i++;
      while (i < n && cmd[i] !== "\"") {
        if (cmd[i] === "\\" && i + 1 < n) { i += 2; continue; }
        i++;
      }
      if (i < n) i++;
      continue;
    }
    if (c === "{") { depth++; i++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0) {
        return hasTopComma ? i : -1;
      }
      i++;
      continue;
    }
    if (c === "," && depth === 1) hasTopComma = true;
    i++;
  }
  return -1;
}

/**
 * Tokenize a Bash command into shell-like tokens, preserving quoted segments
 * as single tokens (with quotes attached, so callers can decide whether to
 * treat the contents as a pattern literal vs path).
 *
 * Conservatively concatenates adjacent fragments separated only by quote
 * boundaries (no intervening whitespace). This collapses shell-word
 * constructions like `.env.''production`, `"foo".env.production`, and
 * `'.env'.production` into a single token before pattern matching. This is a
 * best-effort defense against the "split-with-quotes" bypass class — it does
 * NOT attempt full POSIX shell parsing. `$(...)` and backticks remain
 * unscanned (accepted risk; see codex-review-delivery.md HIGH#3).
 *
 * Operator handling (`; & | ( ) { } < >`) emits standalone tokens, capturing
 * only contiguous operator characters as a single token (e.g. `&&`, `||`,
 * `>>`, `2>`). This ensures no-whitespace forms like `f=x;cat` or
 * `f=x&&cat` correctly split into separate tokens at the operator boundary,
 * so the assignment-prefix bypass class cannot evade segment splitting.
 */
function tokenizeBash(cmd) {
  // Pre-pass: strip heredoc bodies (codex iter-2 MEDIUM-3). Bash heredoc
  // bodies are data, not file paths — leaving them in the input causes the
  // tokenizer to treat body lines as fresh argv tokens (false-blocks). By
  // stripping bodies before tokenization we keep the per-token semantics
  // unchanged and still preserve any same-line redirects that follow the
  // `<<DELIM` introducer.
  cmd = stripHeredocBodies(cmd);
  // Pre-pass: collapse backslash-newline line continuations (codex iter-5
  // HIGH-K). Run AFTER heredoc stripping so heredoc body recognition still
  // sees the original byte layout (delimiters are matched against full lines).
  cmd = removeLineContinuations(cmd);

  const tokens = [];
  let i = 0;
  const n = cmd.length;
  while (i < n) {
    const ch = cmd[i];
    // Newline as statement separator (codex iter-5 HIGH-J). At this point in
    // the tokenizer we are outside any quoted span (quote contents are
    // consumed inline by the word-builder below), so any LF here is a
    // statement boundary. Emit `;` so segment splitting handles it. Heredoc
    // bodies are stripped pre-pass, and backslash-LF line continuations are
    // collapsed pre-pass — so any remaining LF is a real statement separator.
    if (ch === "\n") {
      tokens.push(";");
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Operator characters that always break tokenization. We emit operator
    // tokens at known-valid boundaries: doubled operators (`&&`, `||`, `;;`,
    // `>>`, `<<`) merge into a single token; fd-duplication and heredoc
    // shapes are handled by helper functions; single-char operators emit
    // individually. This prevents mixed runs like `;(` from gluing into a
    // single token that defeats the segment splitter, while still
    // recognizing the standard multi-char shell operators.
    if (isOperatorChar(ch)) {
      // Leading brace expansion: `{a,b,...}` at the start of a token (codex
      // iter-4 HIGH-H). When `{` opens a comma-form brace expansion, we treat
      // the entire `{...}` as the START of a shell word, not a grouping
      // operator. Detection rule: there must be a matching `}` AND at least
      // one top-level comma inside; otherwise fall through to grouping
      // semantics (`{ cmd; }` brace-group).
      //
      // Sequence form `{N..M}` is NOT recognized (no comma) — falls through
      // to grouping. This is the documented accepted gap.
      if (ch === "{") {
        const closeIdx = findBraceExpansionEnd(cmd, i);
        if (closeIdx !== -1) {
          // Re-enter the word-builder by NOT emitting the operator here; the
          // word-building loop below already handles `{` when word is empty
          // via a special-case branch we add. Drop into the word section by
          // breaking out of the operator branch.
          // Implementation: emit no operator, leave i unchanged — fall
          // through to the word-builder below by setting a flag-like state.
          // Simpler: build the word inline here, then continue.
          let word = cmd.slice(i, closeIdx + 1);
          i = closeIdx + 1;
          // Continue accumulating any attached suffix (quote/word fragments
          // up to the next whitespace/operator) so `{a,b}.ts` etc. stay one
          // word.
          while (i < n) {
            const c = cmd[i];
            if (/\s/.test(c) || isOperatorChar(c)) break;
            if (c === "\\" && i + 1 < n) { word += cmd.slice(i, i + 2); i += 2; continue; }
            if (c === "'" || c === "\"") {
              const quote = c;
              const start = i;
              i++;
              while (i < n && cmd[i] !== quote) i++;
              word += cmd.slice(start, Math.min(i + 1, n));
              if (i < n) i++;
              continue;
            }
            word += c;
            i++;
          }
          tokens.push(word);
          continue;
        }
        // Not a brace expansion — fall through to grouping operator emit.
      }
      // Process substitution `<(...)` and `>(...)` (codex iter-4 MED-7). The
      // body is a nested command and is treated as an ACCEPTED GAP, mirroring
      // `$(...)` and backticks. We swallow the entire `<(...)` / `>(...)`
      // construct as a single opaque token (containing parens) so neither the
      // outer redirect classifier nor the segment splitter scans into the
      // body. Depth-tracked to handle nested `<(...<(...)...)`.
      if ((ch === "<" || ch === ">") && i + 1 < n && cmd[i + 1] === "(") {
        const start = i;
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          if (cmd[i] === "(") depth++;
          else if (cmd[i] === ")") depth--;
          if (depth > 0) i++;
        }
        if (i < n) i++; // consume matching `)`
        // Emit as a `PROCSUB` marker token so classifyToken can treat it as
        // a separator (no candidate, no consume-next). The raw bytes are not
        // useful here, but using a distinct prefix keeps debugging readable.
        tokens.push("__PROCSUB__");
        continue;
      }
      // Compound redirect operators (codex iter-4 HIGH-F). These MUST be
      // detected before the heredoc / fd-dup / generic operator branches,
      // because they begin with `<` / `>` / `&` and would otherwise be
      // mis-tokenized as their single-char components.
      //
      //   `&>` / `&>>`       — write both stdout+stderr to file
      //   `>|`               — noclobber-override write
      //   `<>`               — open file read+write (treated as write)
      //   `<<<`              — here-string (next word is DATA, not file)
      //
      // Attached forms (no space before target) emit as combined tokens
      // (e.g. `&>foo`), parallel to existing `>foo`/`<foo` handling. The
      // fd-numbered variants `\d+>|` and `\d+<>` are handled in the numeric
      // prefix branch below.
      if (ch === "<" && i + 2 < n && cmd[i + 1] === "<" && cmd[i + 2] === "<") {
        // Here-string `<<<`. Emit a marker that classifyToken recognizes;
        // parseBashSegment treats the next token as DATA (skips it).
        tokens.push("<<<");
        i += 3;
        continue;
      }
      if (ch === "&" && i + 1 < n && cmd[i + 1] === ">") {
        // `&>` or `&>>` (with optional attached target).
        let opEnd = i + 2;
        if (opEnd < n && cmd[opEnd] === ">") opEnd++;
        // If the next non-operator chars form an attached target word, capture
        // it. Bash treats `&>foo` as a single shell-word redirect.
        if (opEnd < n && !/\s/.test(cmd[opEnd]) && !isOperatorChar(cmd[opEnd]) && cmd[opEnd] !== "&") {
          // Greedy attached-target capture; we let the word-builder semantics
          // be applied later via classifyToken's path extraction.
          const start = i;
          let j = opEnd;
          while (j < n && !/\s/.test(cmd[j]) && !isOperatorChar(cmd[j])) j++;
          tokens.push(cmd.slice(start, j));
          i = j;
          continue;
        }
        tokens.push(cmd.slice(i, opEnd));
        i = opEnd;
        continue;
      }
      if (ch === ">" && i + 1 < n && cmd[i + 1] === "|") {
        // `>|` noclobber-override write. Emit as standalone operator; the
        // next token (if any) is the target.
        tokens.push(">|");
        i += 2;
        continue;
      }
      if (ch === "<" && i + 1 < n && cmd[i + 1] === ">") {
        // `<>` open read+write. Treat as write (write subsumes read in our
        // authority model). May be followed by an attached target.
        const opEnd = i + 2;
        if (opEnd < n && !/\s/.test(cmd[opEnd]) && !isOperatorChar(cmd[opEnd]) && cmd[opEnd] !== "&") {
          const start = i;
          let j = opEnd;
          while (j < n && !/\s/.test(cmd[j]) && !isOperatorChar(cmd[j])) j++;
          tokens.push(cmd.slice(start, j));
          i = j;
          continue;
        }
        tokens.push("<>");
        i = opEnd;
        continue;
      }
      // Heredoc introducer: `<<word` or `<<-word` survived the pre-pass
      // (which strips ONLY the body). Emit the `<<DELIM` portion as a single
      // operator token; downstream segment-splitter treats it as a separator
      // so it never becomes a path candidate. The delimiter word is NOT a
      // file Bash reads.
      if (ch === "<" && i + 1 < n && cmd[i + 1] === "<") {
        const skipPos = scanHeredocIntroducer(cmd, i);
        if (skipPos !== null) {
          // Emit a single SKIP marker token so the segment-splitter does not
          // attempt to classify it as a redirect target. We re-use the
          // grouping `(` token semantics: a known separator with no path
          // attached. To avoid colliding with real `(`/`)`, emit the raw
          // `<<` substring as the marker — classifyToken treats `<<` as a
          // word (no harm; argv0 walker filters operator-only segments).
          tokens.push("<<");
          i = skipPos;
          continue;
        }
        // Fallback: emit `<<` as standalone (extremely rare).
        tokens.push("<<");
        i += 2;
        continue;
      }
      // fd duplication / close: `<&n`, `<&-`, `>&n`, `>&-` (codex iter-2
      // HIGH-C edge cases). Emit as a single token that downstream
      // classifyToken recognizes as a non-file redirect (skip).
      if ((ch === "<" || ch === ">") && i + 1 < n && cmd[i + 1] === "&") {
        // Look ahead for digits or `-` after `&`.
        let j = i + 2;
        if (j < n && cmd[j] === "-") {
          tokens.push(cmd.slice(i, j + 1));
          i = j + 1;
          continue;
        }
        const start = i;
        while (j < n && /[0-9]/.test(cmd[j])) j++;
        if (j > i + 2) {
          tokens.push(cmd.slice(start, j));
          i = j;
          continue;
        }
        // `<&` with no digits/`-` after — defensive: emit as standalone fd-dup
        // marker; downstream classifyToken treats it as a non-file redirect.
        tokens.push(cmd.slice(i, i + 2));
        i += 2;
        continue;
      }
      // Look for a doubled operator first: `&&`, `||`, `;;`, `>>` (and
      // theoretically `<<` but that is handled by the heredoc branch above).
      if (i + 1 < n && cmd[i + 1] === ch && (ch === "&" || ch === "|" || ch === ";" || ch === ">")) {
        tokens.push(cmd.slice(i, i + 2));
        i += 2;
        continue;
      }
      // Read/write redirect followed immediately by a target word — emit as
      // a combined operator-plus-target token (e.g. `<foo`, `>foo`,
      // `>>foo`). Without this, `<foo` would be split into `<` + `foo` and
      // classifyToken would still resolve correctly, but `>foo` already
      // resolves through this path historically. We keep the legacy
      // behavior: single-char operator emit; the inner loop builds the next
      // word.
      // Single-char operator emit. Grouping chars (`(`, `)`, `{`, `}`),
      // single `;`, `&`, `|`, `<`, `>` all fall here. We do NOT chain into
      // following identifier chars — `;cat` becomes `;` + `cat`.
      tokens.push(ch);
      i++;
      continue;
    }
    // Numeric prefix before redirect operator: e.g. `2>foo`, `2>>foo`, `3<foo`,
    // `4<>foo` (codex iter-2 HIGH-C extension). The leading digits attach to
    // the operator so classifyToken sees a normalized redirect shape. We also
    // recognize fd-numbered heredocs (`3<<EOF`) and fd duplication
    // (`2>&1`, `3<&-`). The `<>` read+write form is treated as a write
    // because writes cover reads in our authority model.
    if (/[0-9]/.test(ch)) {
      let look = i;
      while (look < n && /[0-9]/.test(cmd[look])) look++;
      if (look < n && (cmd[look] === ">" || cmd[look] === "<")) {
        const redirChar = cmd[look];
        // fd-numbered here-string: `\d+<<<` (codex iter-5 MED-O). Must be
        // checked BEFORE the fd-numbered heredoc `\d+<<` branch so we don't
        // mis-classify the third `<` as a heredoc introducer. The fd number
        // is informational only — the next operand is here-string DATA on
        // stdin, not a file. Emit the same `<<<` marker as the bare form so
        // parseBashSegment consumes the next operand as data.
        if (redirChar === "<" && look + 2 < n && cmd[look + 1] === "<" && cmd[look + 2] === "<") {
          tokens.push("<<<");
          i = look + 3;
          continue;
        }
        // fd-numbered heredoc: `\d+<<word` (codex iter-2 MEDIUM-3). The
        // body has already been stripped by the pre-pass; here we just
        // consume the `\d+<<DELIM` introducer and emit a SKIP marker.
        if (redirChar === "<" && look + 1 < n && cmd[look + 1] === "<") {
          const skipPos = scanHeredocIntroducer(cmd, look);
          if (skipPos !== null) {
            tokens.push("<<");
            i = skipPos;
            continue;
          }
        }
        // fd-numbered duplication / close: `\d+>&n`, `\d+<&n`, `\d+>&-`,
        // `\d+<&-` (codex iter-2 HIGH-C edge case).
        if (look + 1 < n && cmd[look + 1] === "&") {
          let j = look + 2;
          if (j < n && cmd[j] === "-") {
            tokens.push(cmd.slice(i, j + 1));
            i = j + 1;
            continue;
          }
          const start = i;
          while (j < n && /[0-9]/.test(cmd[j])) j++;
          if (j > look + 2) {
            tokens.push(cmd.slice(start, j));
            i = j;
            continue;
          }
        }
        // fd-numbered read+write: `\d+<>` — write redirect (with optional
        // attached target, e.g. `3<>foo`).
        if (redirChar === "<" && look + 1 < n && cmd[look + 1] === ">") {
          const opEnd = look + 2;
          if (opEnd < n && !/\s/.test(cmd[opEnd]) && !isOperatorChar(cmd[opEnd])) {
            let j = opEnd;
            while (j < n && !/\s/.test(cmd[j]) && !isOperatorChar(cmd[j])) j++;
            tokens.push(cmd.slice(i, j));
            i = j;
            continue;
          }
          const start = i;
          i = opEnd;
          tokens.push(cmd.slice(start, i));
          continue;
        }
        // fd-numbered noclobber-override write: `\d+>|` (codex iter-4 HIGH-F).
        if (redirChar === ">" && look + 1 < n && cmd[look + 1] === "|") {
          const start = i;
          i = look + 2;
          tokens.push(cmd.slice(start, i));
          continue;
        }
        const start = i;
        i = look + 1;
        // Allow at most one doubled redirect (`>>` — `<<` is heredoc above).
        if (i < n && cmd[i] === redirChar && redirChar === ">") i++;
        tokens.push(cmd.slice(start, i));
        continue;
      }
    }

    // Build a single shell word by concatenating adjacent fragments
    // (quoted / unquoted / `$(...)` blocks) until the next whitespace or
    // operator boundary. Each fragment is captured with its surrounding
    // delimiters attached so downstream classifyToken/unquoteToken behavior
    // stays unchanged.
    //
    // Backslash handling: an unquoted `\X` sequence consumes BOTH chars as
    // part of the word, so `\;`, `\&`, `\(`, `\{` etc. do NOT break the
    // word at an operator boundary (codex iter-2 MEDIUM-4). The actual
    // quote-removal step (dropping the backslash) is applied later by
    // unquoteToken. Backslash inside `"..."` follows Bash double-quote
    // semantics — see unquoteToken.
    //
    // Brace handling: a `{...}` construct attaches to the word when it is
    // NOT a standalone grouping operator. Standalone braces require
    // whitespace separation in real Bash (`{ cmd; }`); when the word has
    // already started (e.g. `.env.{production,prod}`), the `{` belongs to a
    // brace-expansion candidate and we capture up to the matching `}` as
    // part of the word. Downstream expandSimpleBraces unfolds the
    // comma-form. This is codex iter-2 HIGH-E.
    let word = "";
    while (i < n) {
      const c = cmd[i];
      if (/\s/.test(c)) break;
      if (c === "\\" && i + 1 < n) {
        // Backslash-escape: consume the next char as part of this word even
        // if it would normally be an operator. Tokenizer keeps the backslash
        // intact; unquoteToken removes it during quote-removal.
        word += cmd.slice(i, i + 2);
        i += 2;
        continue;
      }
      // Brace expansion `{a,b,c}` attaches to the current word. Only consume
      // when the word has non-empty content already (otherwise `{` at the
      // start of a token is the grouping operator and the outer operator
      // branch above already emitted it). We capture up through the matching
      // `}` honoring nested braces. Inside quotes/comment-sub blocks the
      // brace stays literal — but those are handled below via the quote/
      // `$(...)`/backtick branches first.
      if (c === "{" && word.length > 0) {
        const start = i;
        let depth = 1;
        i++;
        while (i < n && depth > 0) {
          if (cmd[i] === "{") depth++;
          else if (cmd[i] === "}") {
            depth--;
            if (depth === 0) { i++; break; }
          }
          i++;
        }
        word += cmd.slice(start, i);
        continue;
      }
      if (isOperatorChar(c)) break;
      // ANSI-C `$'...'` and locale `$"..."` quote forms (codex iter-4 HIGH-G).
      // The `$` glues to the opening quote and the entire `$'...'` / `$"..."`
      // segment is captured as part of the current word. Downstream
      // unquoteToken decodes ANSI-C escapes / strips the `$` prefix. This MUST
      // be checked BEFORE the `$(` command-substitution branch.
      if (c === "$" && i + 1 < n && (cmd[i + 1] === "'" || cmd[i + 1] === "\"")) {
        const quote = cmd[i + 1];
        const start = i;
        i += 2;
        if (quote === "'") {
          // ANSI-C: backslash inside `$'...'` escapes the next char (including
          // `\'` to embed a literal quote). Scan until unescaped closing `'`.
          while (i < n) {
            if (cmd[i] === "\\" && i + 1 < n) { i += 2; continue; }
            if (cmd[i] === "'") break;
            i++;
          }
        } else {
          // Locale `$"..."`: scan until unescaped closing `"`.
          while (i < n) {
            if (cmd[i] === "\\" && i + 1 < n) { i += 2; continue; }
            if (cmd[i] === "\"") break;
            i++;
          }
        }
        if (i < n) i++; // consume closing quote
        word += cmd.slice(start, i);
        continue;
      }
      if (c === "'" || c === "\"") {
        const quote = c;
        const start = i;
        i++;
        while (i < n && cmd[i] !== quote) i++;
        word += cmd.slice(start, Math.min(i + 1, n));
        if (i < n) i++;
        continue;
      }
      // Command substitution `$(...)` and backtick: absorb the entire
      // expression as one opaque fragment of the current word. We do NOT
      // attempt to parse inside; whatever bytes appear are intentionally
      // treated as accepted-risk noise (see codex-review-delivery.md HIGH#3).
      // This also prevents the closing `)` from being mistaken for a
      // statement boundary by the tokenizer.
      if (c === "$" && i + 1 < n && cmd[i + 1] === "(") {
        const start = i;
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          if (cmd[i] === "(") depth++;
          else if (cmd[i] === ")") depth--;
          if (depth > 0) i++;
        }
        // i points at the matching ')' (or end-of-string if unclosed).
        if (i < n) i++;
        word += cmd.slice(start, i);
        continue;
      }
      if (c === "`") {
        const start = i;
        i++;
        while (i < n && cmd[i] !== "`") i++;
        word += cmd.slice(start, Math.min(i + 1, n));
        if (i < n) i++;
        continue;
      }
      // Unquoted fragment: scan until whitespace, quote, command-substitution
      // start, backtick, backslash, opening brace, or operator.
      const start = i;
      while (
        i < n &&
        !/\s/.test(cmd[i]) &&
        cmd[i] !== "'" &&
        cmd[i] !== "\"" &&
        cmd[i] !== "`" &&
        cmd[i] !== "\\" &&
        cmd[i] !== "{" &&
        !isOperatorChar(cmd[i]) &&
        !(cmd[i] === "$" && i + 1 < n && cmd[i + 1] === "(")
      ) {
        i++;
      }
      word += cmd.slice(start, i);
    }
    if (word.length > 0) tokens.push(word);
  }
  return tokens;
}

/**
 * Pre-pass that strips heredoc bodies from the command string (codex iter-2
 * MEDIUM-3). Identifies `<<word` and `<<-word` introducers (with optional
 * fd-number prefix and optional `<<<` here-string carve-out) and removes the
 * body content between the line terminator and the matching delimiter.
 *
 * Crucially we leave the `<<DELIM` introducer itself in the output so the
 * main tokenizer can still see same-line redirects that follow the
 * introducer (e.g. `cat <<EOF >> .env.production`). Only the BODY (data
 * between the next newline and the closing delimiter line, inclusive) is
 * removed.
 *
 * Quoted delimiters (`<<'EOF'`, `<<"EOF"`) are honored — the delimiter Bash
 * matches against is the unquoted form. `<<-DELIM` allows leading tabs in
 * body and delimiter; we honor that variant by trimming leading tabs from
 * candidate delimiter lines.
 *
 * Multiple heredocs on the same command line (e.g. piping two scripts) are
 * processed in order. Body content is never emitted to the tokenizer, which
 * is what prevents the `cat <<EOF\n.env.production\nEOF` false-block.
 */
function stripHeredocBodies(cmd) {
  if (!cmd) return cmd;
  // Fast path: no `<<` anywhere means no heredocs.
  if (cmd.indexOf("<<") < 0) return cmd;
  let out = "";
  let i = 0;
  const n = cmd.length;
  // Collected pending heredocs to consume after the next newline. Bash allows
  // multiple introducers on one line (e.g. `cat <<A <<B`); each contributes a
  // body section in declaration order after the line break.
  let pendingDelims = [];
  while (i < n) {
    const c = cmd[i];
    // Check for here-string `<<<` first — those are NOT heredocs; the next
    // word IS the data (handled by the normal tokenizer redirect path).
    if (c === "<" && i + 2 < n && cmd[i + 1] === "<" && cmd[i + 2] === "<") {
      out += cmd.slice(i, i + 3);
      i += 3;
      continue;
    }
    // Heredoc introducer: optionally fd-prefix already consumed above, here
    // we just see `<<` possibly followed by `-`.
    if (c === "<" && i + 1 < n && cmd[i + 1] === "<") {
      out += "<<";
      i += 2;
      // `<<-` variant
      let stripTabs = false;
      if (i < n && cmd[i] === "-") {
        out += "-";
        stripTabs = true;
        i++;
      }
      // Skip whitespace before the delimiter (but preserve in output so
      // tokenizer positions are correct).
      while (i < n && (cmd[i] === " " || cmd[i] === "\t")) {
        out += cmd[i];
        i++;
      }
      // Capture the delimiter word. Quoted delimiters disable body
      // expansion — we don't care about expansion semantics, but we need to
      // strip the quotes when comparing the body terminator line.
      const delimStart = i;
      while (i < n) {
        const dc = cmd[i];
        if (dc === " " || dc === "\t" || dc === "\n") break;
        if (dc === ";" || dc === "|" || dc === "&" || dc === ">" || dc === "<" || dc === "(" || dc === ")") break;
        i++;
      }
      const rawDelim = cmd.slice(delimStart, i);
      out += rawDelim;
      const unquotedDelim = rawDelim.replace(/['"]/g, "");
      if (unquotedDelim) {
        pendingDelims.push({ delim: unquotedDelim, stripTabs });
      }
      continue;
    }
    // Numeric fd prefix on a heredoc: `\d+<<word` or `\d+<<-word`. We let
    // the digits flow into `out` normally; the `<<` that follows is caught
    // by the branch above.
    if (c === "\n" && pendingDelims.length > 0) {
      // Emit the newline.
      out += "\n";
      i++;
      // Consume pending heredoc bodies in declaration order.
      while (pendingDelims.length > 0) {
        const { delim, stripTabs } = pendingDelims.shift();
        // Scan lines until we find the delimiter as a standalone line.
        while (i < n) {
          const lineStart = i;
          while (i < n && cmd[i] !== "\n") i++;
          let line = cmd.slice(lineStart, i);
          if (stripTabs) line = line.replace(/^\t+/, "");
          if (line === delim) {
            // Skip the delimiter line and its newline. Body has been
            // discarded.
            if (i < n) i++;
            break;
          }
          if (i < n) i++;
        }
      }
      continue;
    }
    out += c;
    i++;
  }
  // If we reach EOF with pendingDelims still set, the body was never
  // terminated — its content was emitted to `out` up to where pendingDelims
  // became non-empty. That's fine: best-effort. Real Bash would also fail.
  return out;
}

/**
 * Collapse backslash-newline pairs (line continuations) per Bash quoting
 * semantics (codex iter-5 HIGH-K).
 *
 * Bash removes `\\<LF>` in unquoted text AND inside double quotes; inside
 * single quotes the backslash is literal so the pair is preserved. Inside
 * `$'...'` (ANSI-C quoting) we ALSO preserve the pair because the ANSI-C
 * decoder owns its own escape interpretation — decoding `\n` here before
 * decodeAnsiCEscapes runs would double-decode.
 *
 * This pre-pass is required so `cat \<LF>.env.production` collapses to
 * `cat .env.production` instead of leaving a literal LF byte glued to the
 * next word.
 */
function removeLineContinuations(cmd) {
  if (!cmd || cmd.indexOf("\\") < 0) return cmd;
  let out = "";
  let i = 0;
  const n = cmd.length;
  // Quote state: 0 = unquoted, 1 = single, 2 = double, 3 = ANSI-C `$'...'`,
  // 4 = locale `$"..."`. The `$"..."` form behaves like double-quoted for
  // backslash purposes, so it follows the same removal rule (state 2).
  let state = 0;
  while (i < n) {
    const c = cmd[i];
    if (state === 0) {
      if (c === "'") { state = 1; out += c; i++; continue; }
      if (c === "\"") { state = 2; out += c; i++; continue; }
      if (c === "$" && i + 1 < n && cmd[i + 1] === "'") {
        state = 3; out += cmd.slice(i, i + 2); i += 2; continue;
      }
      if (c === "$" && i + 1 < n && cmd[i + 1] === "\"") {
        // `$"..."` — backslash semantics match double quotes.
        state = 2; out += cmd.slice(i, i + 2); i += 2; continue;
      }
      if (c === "\\" && i + 1 < n && cmd[i + 1] === "\n") {
        // Drop the pair.
        i += 2;
        continue;
      }
      // Other backslash escapes outside quotes consume the next char as part
      // of the token; preserve verbatim here (unquoteToken handles removal).
      if (c === "\\" && i + 1 < n) { out += cmd.slice(i, i + 2); i += 2; continue; }
      out += c; i++; continue;
    }
    if (state === 1) {
      // Single-quoted: literal — never remove anything.
      if (c === "'") { state = 0; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 2) {
      // Double-quoted: backslash-LF is removed; other escapes preserved.
      if (c === "\\" && i + 1 < n && cmd[i + 1] === "\n") { i += 2; continue; }
      if (c === "\\" && i + 1 < n) { out += cmd.slice(i, i + 2); i += 2; continue; }
      if (c === "\"") { state = 0; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 3) {
      // ANSI-C `$'...'` — preserve everything; decodeAnsiCEscapes handles it.
      if (c === "\\" && i + 1 < n) { out += cmd.slice(i, i + 2); i += 2; continue; }
      if (c === "'") { state = 0; out += c; i++; continue; }
      out += c; i++; continue;
    }
    // Unreachable; defensive.
    out += c; i++;
  }
  return out;
}

/**
 * Scan past a `<<word` or `<<-word` heredoc introducer (after body stripping
 * has already happened). Returns the position just past the delimiter word,
 * or null if the shape is malformed.
 *
 * Given the position of `<<` at `ltStart`, advance past `<<[-]DELIM`,
 * returning the new cursor. The delimiter is NOT emitted as a token by the
 * caller — heredoc introducers are pure operators.
 */
function scanHeredocIntroducer(cmd, ltStart) {
  const n = cmd.length;
  let i = ltStart + 2;
  // `<<-` variant.
  if (i < n && cmd[i] === "-") i++;
  // Skip whitespace before the delimiter.
  while (i < n && (cmd[i] === " " || cmd[i] === "\t")) i++;
  if (i >= n) return null;
  // Consume delimiter word.
  while (i < n) {
    const dc = cmd[i];
    if (dc === " " || dc === "\t" || dc === "\n") break;
    if (dc === ";" || dc === "|" || dc === "&" || dc === ">" || dc === "<" || dc === "(" || dc === ")") break;
    i++;
  }
  return i;
}

/**
 * Strip redirection prefixes like `>`, `>>`, `2>`, etc. and return either the
 * inner path token or null. Operator-as-its-own-token is signaled by returning
 * the literal operator string so the caller can pick the next token as the
 * target.
 *
 * Supports (codex iter-2 HIGH-C):
 *   - `>foo`, `>>foo`, `\d+>foo`, `\d+>>foo` → write-target
 *   - `>`, `>>`, `\d+>`, `\d+>>` → write-redirect-next
 *   - `<foo`, `\d+<foo`, `\d+<>foo` → read-target / write-target
 *   - `<`, `\d+<`, `\d+<>` → read-redirect-next / write-redirect-next
 *   - `<&n`, `<&-`, `>&n`, `>&-`, `\d+<&n`, etc. → fd-dup (NOT a file ref)
 */
function classifyToken(tok) {
  // Process-substitution placeholder (codex iter-4 MED-7). Treated as a
  // separator — body is the accepted gap; the surrounding operands continue
  // to be parsed normally by the segment splitter.
  if (tok === "__PROCSUB__") return { kind: "separator" };

  // Here-string `<<<` (codex iter-4 MED-5). The next token is DATA passed
  // on stdin; it is NOT a file Bash reads. Callers consume and discard the
  // next operand without emitting a candidate.
  if (tok === "<<<") return { kind: "here-string-next" };

  // Heredoc introducer marker: `<<`, `<<-`, `\d+<<`, `\d+<<-` (codex iter-2
  // MEDIUM-3). The body has already been stripped by the pre-pass; the
  // delimiter word is also pre-consumed inside the tokenizer. The `<<`
  // marker token reaches classifyToken only as a vestigial separator —
  // never a file path. Return fd-dup kind which the callers treat as a
  // no-op skip.
  if (/^\d*<<-?$/.test(tok) || tok === "<<") return { kind: "fd-dup" };

  // fd duplication / close: `<&n`, `<&-`, `>&n`, `>&-`, `\d+<&n`, `\d+>&n`.
  // These are fd-table operations, not file references — skip entirely.
  if (/^\d*[<>]&(?:[0-9]+|-)?$/.test(tok)) return { kind: "fd-dup" };

  // Compound noclobber-override write: `>|` and `\d+>|` (codex iter-4 HIGH-F).
  // Standalone form consumes next token as target.
  if (/^\d*>\|$/.test(tok)) return { kind: "write-redirect-next" };
  // Attached form: `>|foo`, `2>|foo`.
  const noClobberM = tok.match(/^\d*>\|(.+)$/);
  if (noClobberM) return { kind: "write-target", path: noClobberM[1] };

  // Compound stdout+stderr redirect: `&>` and `&>>` (codex iter-4 HIGH-F).
  if (tok === "&>" || tok === "&>>") return { kind: "write-redirect-next" };
  // Attached form: `&>foo`, `&>>foo`.
  const andRedirM = tok.match(/^&>>?(.+)$/);
  if (andRedirM) return { kind: "write-target", path: andRedirM[1] };

  // fd-numbered read+write: `\d+<>` (codex iter-2 HIGH-C) and bare `<>`
  // (codex iter-4 HIGH-F). Treated as a write redirect because write
  // authority subsumes read in our model.
  if (/^\d*<>$/.test(tok)) return { kind: "write-redirect-next" };
  // Same form with attached target: `\d+<>foo`, `<>foo`.
  const readWriteM = tok.match(/^\d*<>(.+)$/);
  if (readWriteM) return { kind: "write-target", path: readWriteM[1] };

  // Operators that consume the next token as a redirect target (write).
  // Includes `>`, `>>`, `\d+>`, `\d+>>`.
  if (/^\d*>>?$/.test(tok)) return { kind: "write-redirect-next" };
  // Combined form: `>foo`, `>>foo`, `2>foo`, `2>>foo`.
  const writeM = tok.match(/^\d*>>?(.+)$/);
  if (writeM) return { kind: "write-target", path: writeM[1] };

  // Read redirect: `<`, `\d+<` (codex iter-2 HIGH-C). Standalone forms
  // consume the next token as the file target.
  if (/^\d*<$/.test(tok)) return { kind: "read-redirect-next" };
  // Combined form: `<foo`, `\d+<foo`.
  const readM = tok.match(/^\d*<(.+)$/);
  if (readM) return { kind: "read-target", path: readM[1] };

  // Command terminators / pipes / grouping — split semantics.
  // Grouping tokens `(`, `)`, `{`, `}` also count as separators so wrapping
  // a command in a subshell or brace group cannot smuggle bytes through.
  if (
    tok === "|" || tok === "||" || tok === "&&" ||
    tok === ";" || tok === ";;" || tok === "&" ||
    tok === "(" || tok === ")" ||
    tok === "{" || tok === "}"
  ) {
    return { kind: "separator" };
  }
  return { kind: "word", path: tok };
}

/**
 * Parse a Bash command and return [{ path, operation }] tuples. Best-effort
 * shell semantics — recognizes redirects, tee/cp/mv/dd/sed -i/awk -i inplace,
 * skips pattern operands of grep/rg/ag, and dispatches `find` to its own
 * option-aware parser (parseFindArgs) per codex MEDIUM#1.
 *
 * Variable expansion is collapsed only for trivial single-token uses
 * (`$VAR`/`${VAR}`). When a segment contains a leading `name=value`
 * assignment with a single literal RHS (no `$(...)`, no backticks, no nested
 * parameter expansion), the assignment is added to a statement-local symbol
 * table that subsequent segments can expand from. This handles the
 * `f=.env.production; cat $f` bypass class. `$(...)` and backticks remain
 * unscanned — accepted risk documented in codex-review-delivery.md HIGH#3.
 */
function parseBashCandidates(cmd) {
  const tuples = [];
  if (!cmd) return tuples;

  const tokens = tokenizeBash(cmd);
  // Split into "simple commands" separated by pipes/semicolons/grouping.
  // Each segment is processed independently for argv0 classification, but a
  // shared symbol table flows across segments so assignment-only segments
  // influence reads in later segments of the same statement.
  //
  // Grouping tokens (`(`, `)`, `{`, `}`) are treated as segment separators so
  // wrapping a command in a subshell or brace group does not let the
  // grouping byte become argv0. Each non-empty bracket-delimited segment
  // parses normally with the shared symbol table.
  // Separator tokens that end a segment without contributing operands. The
  // `__PROCSUB__` marker is included so process-substitution placeholders
  // (codex iter-4 MED-7) split out of the parent command rather than become a
  // stray argv operand of the parent.
  //
  // NOTE: do NOT include `__PROCSUB__` as a hard segment-terminator since
  // that would also break grouped commands like `cat <(echo foo) > X` — we
  // need the trailing `> X` to remain attached to the same segment so its
  // redirect target is still classified. We therefore filter the marker out
  // of segments later, after tokenization.
  const SEPARATOR_TOKENS = new Set([
    "|", "||", "&&", ";", ";;", "&",
    "(", ")", "{", "}"
  ]);
  let segments = [];
  let current = [];
  for (const tok of tokens) {
    if (SEPARATOR_TOKENS.has(tok)) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    // Retain process-substitution placeholders (codex iter-5 HIGH-M). The
    // body remains an accepted gap, but the marker must reach the segment
    // parser so it can satisfy a preceding redirect operator (`< <(...)`,
    // `> >(...)`). Without this the redirect operator would consume the
    // next real operand as its target and mis-classify it. Standalone
    // placeholders that are NOT consumed as a redirect target are dropped
    // by parseBashSegment.
    current.push(tok);
  }
  if (current.length) segments.push(current);

  const symbolTable = new Map();
  for (const seg of segments) {
    parseBashSegment(seg, tuples, symbolTable);
  }
  return tuples;
}

/**
 * Determine whether an assignment RHS is a single literal token that is
 * safe to add to the statement-local symbol table. Reject command
 * substitution `$(...)`, backticks, and parameter expansion `${...}` — those
 * are intentional accepted-risk gaps and the symbol-table fast path must not
 * promote them to clean literals.
 */
function isLiteralAssignmentRhs(rhs) {
  if (rhs === "" || rhs == null) return true; // empty RHS is literal
  if (rhs.includes("`")) return false;
  if (rhs.includes("$(")) return false;
  if (rhs.includes("${")) return false;
  if (rhs.includes("$")) return false; // unbraced `$name` reference
  return true;
}

/**
 * Push one or more candidates derived from a raw shell token. Applies the
 * full normalization pipeline (codex iter-2 HIGH-C/D/E + iter-4 MED-6):
 *
 *   1. expandSimpleBraces — unfold simple `{a,b,c}` comma-form expansions on
 *      the RAW (still-quoted) token. Quoted braces stay literal.
 *   2. unquoteToken — strip surrounding quotes and apply Bash quote-removal
 *      backslash semantics on each expanded form.
 *   3. expandSimpleVar — collapse single-token `$VAR`/`${VAR}` references
 *      against the statement-local symbol table or `process.env`.
 *
 * Each derived candidate is pushed as a separate tuple; this ensures every
 * brace-expanded sibling is independently matched against sensitive patterns.
 *
 * Empty / falsy candidates after normalization are skipped — they cannot
 * match any sensitive pattern. Tokens that classifyToken would treat as
 * fd-dup are NOT routed here (the caller handles fd-dup as a skip).
 *
 * Order rationale (iter-4 MED-6): brace expansion must precede unquote so the
 * quote-aware brace finder can leave quoted braces intact. If we unquoted
 * first, `".env.{production,prod}"` would become `.env.{production,prod}` and
 * the expansion machinery could no longer tell the braces were originally
 * literal.
 */
function pushPathCandidates(tuples, rawToken, operation, symbolTable, intent) {
  if (rawToken === null || rawToken === undefined || rawToken === "") return;
  // Process-substitution placeholder (codex iter-5 HIGH-M). When a `<(...)` /
  // `>(...)` construct satisfies a preceding redirect operator (`< <(...)`,
  // `> >(...)`), the placeholder must be consumed as the redirect target so
  // the operator does not slide onto the next real operand — but the body is
  // an accepted gap and produces NO candidate. Drop here.
  if (rawToken === "__PROCSUB__") return;
  const expansions = expandSimpleBraces(String(rawToken));
  for (const expanded of expansions) {
    const normalized = unquoteToken(expanded);
    if (!normalized) continue;
    const resolved = expandSimpleVar(normalized, symbolTable);
    if (resolved) {
      const tuple = { path: resolved, operation };
      if (intent) tuple.intent = intent;
      tuples.push(tuple);
    }
  }
}

// File-selector flag sets per pattern-tool. Values flagged here are scanned
// as read candidates (file selectors), NOT skipped as the search literal.
// Supports both `--flag value` (separate operand) and `--flag=value` forms.
const RG_FILE_SELECTOR_FLAGS = new Set(["-g", "--glob", "--iglob"]);
const GREP_FILE_SELECTOR_FLAGS = new Set(["--include", "--exclude"]);

function isRipgrep(argv0) {
  return argv0 === "rg" || argv0 === "ripgrep";
}
function isGrepFamily(argv0) {
  return argv0 === "grep" || argv0 === "egrep" || argv0 === "fgrep" || argv0 === "ag" || argv0 === "ack";
}

/**
 * Extract a file-selector value when this token is a recognized flag for
 * the current pattern-tool. Returns:
 *   { kind: "value-attached", value }  — `--flag=value` form, or ripgrep
 *                                        short-attached `-gPATTERN` form
 *   { kind: "value-next", flag }       — `--flag` followed by a separate value token
 *   null                                — not a file-selector flag
 *
 * IMPORTANT: callers MUST pass an unquoted token (after `unquoteToken()`).
 * Shell removes quotes before execution so `"--glob=.env.production*"`
 * resolves to `--glob=.env.production*` at the program-argv layer. We must
 * see the same form here, otherwise the equals-split below fails to find
 * a tail and the value silently bypasses scanning.
 */
function matchFileSelectorFlag(argv0, token) {
  if (!token || !token.startsWith("-")) return null;
  const eqIdx = token.indexOf("=");
  const head = eqIdx >= 0 ? token.slice(0, eqIdx) : token;
  const tail = eqIdx >= 0 ? token.slice(eqIdx + 1) : null;

  if (isRipgrep(argv0)) {
    if (RG_FILE_SELECTOR_FLAGS.has(head)) {
      return tail !== null
        ? { kind: "value-attached", value: tail }
        : { kind: "value-next", flag: head };
    }
    // Ripgrep's documented short attached form: `-gPATTERN` with no space.
    // The leading flag is `-g` (two chars); anything after is the glob value.
    // This MUST be checked after the `--glob`/`--iglob` exact matches above
    // so longer flag names take priority. Length>2 ensures we don't treat a
    // bare `-g` as attached.
    if (token.length > 2 && token.startsWith("-g") && !token.startsWith("--")) {
      // Skip the rare ambiguous case where `-g=` is used (already handled by
      // the equals branch above when head==="-g").
      const value = token.slice(2);
      // Defensive: reject leading `=` (would be `-g=value`, handled above).
      if (value.length > 0 && !value.startsWith("=")) {
        return { kind: "value-attached", value };
      }
    }
  } else if (isGrepFamily(argv0)) {
    if (GREP_FILE_SELECTOR_FLAGS.has(head)) {
      return tail !== null
        ? { kind: "value-attached", value: tail }
        : { kind: "value-next", flag: head };
    }
  }
  return null;
}

/**
 * Parse `find` operands per the option semantics in FIND_*_OPTS sets above.
 *
 * find argv shape: `find [global-opts] [paths...] [expression]` where any
 * non-flag operand BEFORE the first option flag is a PATH ROOT (real file
 * or directory — read candidate). After the first `-option`, operands are
 * either search-literals, file references, metadata, or expression terminators.
 *
 * The `-exec`/`-execdir`/`-ok`/`-okdir` body is treated as an accepted gap —
 * we recognize the option and consume operands up to `;` or `+` but do NOT
 * recursively scan the nested command. This mirrors the documented HIGH#3
 * accepted risk for command substitution.
 *
 * Tokens are passed in raw (still-quoted) form so the caller can detect
 * redirects via classifyToken. We unquote selectively at use sites.
 */
function parseFindArgs(args, tuples, symbolTable) {
  // Phase 1: collect path roots — non-flag operands preceding the first `-`
  // operand (excluding global flags `-L`, `-P`, `-H`, `-O <N>` which can appear
  // before paths). We treat any token starting with `-` as the end of the
  // path-root section EXCEPT the documented global flags.
  let i = 0;
  while (i < args.length) {
    const tokRaw = args[i];
    if (!tokRaw) { i++; continue; }
    // Handle redirects mid-args (defensive — `find` is usually first command,
    // but pipes/redirects can appear).
    const cls = classifyToken(tokRaw);
    if (cls.kind === "fd-dup") { i++; continue; }
    // Here-string `<<<`: next operand is data passed on stdin, not a file
    // (codex iter-4 MED-5). Skip both the marker and the data token.
    if (cls.kind === "here-string-next") { i += 2; continue; }
    if (cls.kind === "write-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "write", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "write-target") {
      pushPathCandidates(tuples, cls.path, "write", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "read-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "read", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "read-target") {
      pushPathCandidates(tuples, cls.path, "read", symbolTable);
      i++;
      continue;
    }
    if (cls.kind !== "word") { i++; continue; }

    const tok = unquoteToken(tokRaw);
    // First option flag terminates the path-root section. Global flags
    // (-L/-P/-H consume zero operands, -O consumes one) are tolerated but we
    // do not attempt fine-grained parsing — once we see ANY `-`-prefixed
    // token, hand off to phase 2.
    if (tok.startsWith("-")) break;
    // Path root: real-file reference (read candidate).
    pushPathCandidates(tuples, tokRaw, "read", symbolTable);
    i++;
  }

  // Phase 2: option processing. From here, every non-flag operand is governed
  // by its preceding option flag (search literal, real file, metadata, etc.).
  while (i < args.length) {
    const tokRaw = args[i];
    if (!tokRaw) { i++; continue; }
    // Mid-stream redirects.
    const cls = classifyToken(tokRaw);
    if (cls.kind === "fd-dup") { i++; continue; }
    if (cls.kind === "here-string-next") { i += 2; continue; }
    if (cls.kind === "write-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "write", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "write-target") {
      pushPathCandidates(tuples, cls.path, "write", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "read-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "read", symbolTable);
      i++;
      continue;
    }
    if (cls.kind === "read-target") {
      pushPathCandidates(tuples, cls.path, "read", symbolTable);
      i++;
      continue;
    }
    if (cls.kind !== "word") { i++; continue; }

    const tok = unquoteToken(tokRaw);

    if (FIND_SEARCH_LITERAL_OPTS.has(tok)) {
      // Skip operand: it's a glob/regex search literal, not a file reference.
      i += 2;
      continue;
    }
    if (FIND_READ_OPERAND_OPTS.has(tok)) {
      pushPathCandidates(tuples, args[i + 1] || "", "read", symbolTable);
      i += 2;
      continue;
    }
    if (FIND_WRITE_OPERAND_OPTS.has(tok)) {
      pushPathCandidates(tuples, args[i + 1] || "", "write", symbolTable);
      i += 2;
      continue;
    }
    if (FIND_EXEC_OPTS.has(tok)) {
      // Accepted gap: consume operands up to `;` or `+`, do NOT recursively
      // scan the nested command. This mirrors the HIGH#3 accepted-risk gap
      // for command substitution — see codex MEDIUM#1 for rationale.
      i++;
      while (i < args.length) {
        const inner = unquoteToken(args[i] || "");
        if (FIND_EXEC_TERMINATORS.has(inner)) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (FIND_SKIP_OPERAND_OPTS.has(tok)) {
      // Skip operand: metadata predicate (time, size, type, etc.).
      i += 2;
      continue;
    }
    if (FIND_NO_OPERAND_OPTS.has(tok)) {
      // Zero-operand flag.
      i++;
      continue;
    }
    // Unknown option (starts with `-`) — be defensive: consume just the flag,
    // do NOT consume the next operand (it might be a real-file reference we
    // care about). Allow the next iteration to classify it.
    if (tok.startsWith("-")) {
      i++;
      continue;
    }
    // Bare non-flag operand in the expression section. Could be a stray path
    // root after global options. Treat as a read candidate to stay
    // conservative (e.g. `find -L .env.production`).
    pushPathCandidates(tuples, tokRaw, "read", symbolTable);
    i++;
  }
}

function parseBashSegment(segment, tuples, symbolTable) {
  if (!segment.length) return;

  // Identify argv0 by skipping leading var-assignment tokens (FOO=bar).
  // Harvest each literal-RHS assignment into the statement-local symbol
  // table so later segments can expand `$name` references.
  let argv0Idx = 0;
  while (argv0Idx < segment.length) {
    const t = segment[argv0Idx];
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) break;
    if (symbolTable) {
      const name = m[1];
      // The RHS may itself be a quoted token (e.g. `f="value"`); unquote
      // before stashing so `$f` expansions yield the bare literal.
      const rawRhs = m[2];
      if (isLiteralAssignmentRhs(rawRhs)) {
        symbolTable.set(name, unquoteToken(rawRhs));
      } else {
        // Non-literal RHS (command substitution, parameter expansion):
        // intentionally NOT added — accepted risk documented in
        // codex-review-delivery.md HIGH#3.
        symbolTable.delete(name);
      }
    }
    argv0Idx++;
  }

  // Unwrap Bash control prefixes (codex iter-5 HIGH-I; iter-6 verify-fix iter-2
  // extension HIGH-A). Reserved-word prefixes precede a pipeline/command and
  // the wrapped command's argv0 is the next non-prefix token. Without
  // unwrapping, `! cat .env.production` (or `command cat ...`, etc.) would
  // treat the prefix as argv0 and never classify `cat`. Loop because a user
  // could compose prefixes like `! exec cat ...` or `time command cat ...`.
  //
  // Recognized reserved-word control prefixes:
  //   - `!`     — pipeline negation
  //   - `time`  — pipeline timing (optional `-p` POSIX-format flag)
  //   - `command` — bypass shell function/alias lookup (optional `-p`/`-v`/
  //                 `-V`/`--` flags per POSIX builtin syntax)
  //   - `builtin` — force builtin lookup (no flag args)
  //   - `exec`  — replace shell with command. Accepts `[-cl] [-a name]` per
  //                `help exec`: `-c` clears env, `-l` prepends `-` to argv[0],
  //                `-a NAME` overrides argv[0]. Short flags cluster
  //                (`-cl`, `-la NAME`, `-cla NAME`). Without flag consumption
  //                the unwrap loop would treat the flag itself as argv0 and
  //                miss the wrapped sensitive command. Leading redirect-only
  //                forms (`exec > foo`) are still classified by the
  //                leading-redirect loop after unwrap.
  //
  // OUT OF SCOPE (iter-7 candidates): external command wrappers like `sudo`,
  // `nice`, `nohup`, `env`, `timeout`, and `eval` re-parse. Those have
  // different semantic classes (per-wrapper flag/arg arities, `env`
  // assignment-prefix ambiguity, `eval` requires re-parsing the argv string)
  // and are deferred to avoid subtle bugs in this iteration.
  while (argv0Idx < segment.length) {
    const t = unquoteToken(segment[argv0Idx] || "");
    if (t === "!") { argv0Idx++; continue; }
    if (t === "time") {
      argv0Idx++;
      // Optional `-p` flag (`time -p cmd`).
      if (argv0Idx < segment.length && unquoteToken(segment[argv0Idx] || "") === "-p") {
        argv0Idx++;
      }
      continue;
    }
    if (t === "command") {
      argv0Idx++;
      // Optional POSIX `command` flags (`-p` / `-v` / `-V` / `--`). Consume
      // at most one — `command` accepts these as a single flag, not chained.
      if (argv0Idx < segment.length) {
        const flag = unquoteToken(segment[argv0Idx] || "");
        if (flag === "-p" || flag === "-v" || flag === "-V" || flag === "--") {
          argv0Idx++;
        }
      }
      continue;
    }
    if (t === "builtin") { argv0Idx++; continue; }
    if (t === "exec") {
      argv0Idx++;
      // Consume any clustered short-flag run matching `-[acl]+` per
      // `help exec`: `-c`, `-l`, `-a NAME` (and combinations like `-cl`,
      // `-la NAME`, `-cla NAME`, `-acl NAME`). Multiple separate flag tokens
      // (e.g. `exec -c -l cat ...`) are also handled by the surrounding
      // loop body re-entry. Stop at the first non-flag token (argv0) or
      // when no further tokens remain.
      while (argv0Idx < segment.length) {
        const flagTok = unquoteToken(segment[argv0Idx] || "");
        // Match a cluster: leading `-` followed by one or more of [acl] only.
        // Reject `-`, `--`, `-x`, `-aa`, etc. — only the documented flag
        // chars qualify so we don't accidentally consume a future Bash flag
        // or a sensitive operand that happens to begin with `-`.
        const clusterMatch = /^-([acl]+)$/.exec(flagTok);
        if (!clusterMatch) break;
        const chars = clusterMatch[1];
        argv0Idx++;
        // If the cluster contains `a`, the next token is the NAME operand
        // (consumed even if subsequent flag tokens follow on later loops).
        if (chars.includes("a") && argv0Idx < segment.length) {
          argv0Idx++;
        }
      }
      continue;
    }
    break;
  }

  // Classify any leading redirects that precede argv0 (codex iter-5 HIGH-L).
  // Bash allows redirects to appear before the command name
  // (e.g. `> .env.production echo ok`). Walk forward, emitting tuples for
  // each redirect found, until we hit a non-redirect non-assignment token —
  // that token becomes argv0. Redirect targets satisfied by a process-sub
  // placeholder are consumed via pushPathCandidates' built-in skip.
  while (argv0Idx < segment.length) {
    const tokRaw = segment[argv0Idx];
    if (!tokRaw) { argv0Idx++; continue; }
    const cls = classifyToken(tokRaw);
    if (cls.kind === "fd-dup") { argv0Idx++; continue; }
    if (cls.kind === "here-string-next") { argv0Idx += 2; continue; }
    if (cls.kind === "write-redirect-next") {
      pushPathCandidates(tuples, segment[argv0Idx + 1] || "", "write", symbolTable);
      argv0Idx += 2;
      continue;
    }
    if (cls.kind === "write-target") {
      pushPathCandidates(tuples, cls.path, "write", symbolTable);
      argv0Idx++;
      continue;
    }
    if (cls.kind === "read-redirect-next") {
      pushPathCandidates(tuples, segment[argv0Idx + 1] || "", "read", symbolTable);
      argv0Idx += 2;
      continue;
    }
    if (cls.kind === "read-target") {
      pushPathCandidates(tuples, cls.path, "read", symbolTable);
      argv0Idx++;
      continue;
    }
    // Non-redirect: this is argv0.
    break;
  }

  const argv0Raw = unquoteToken(segment[argv0Idx] || "");
  const argv0 = path.basename(argv0Raw || "");

  // Argument cursor: tokens after argv0.
  const args = segment.slice(argv0Idx + 1);

  // `find` has dedicated option-aware parsing: -name/-path operands are
  // search literals (skipped), -newer/-fprint operands are file references,
  // path roots are read candidates. See parseFindArgs above.
  if (argv0 === "find") {
    parseFindArgs(args, tuples, symbolTable);
    return;
  }

  // Tools whose pattern operand we must NOT scan.
  const isPatternTool = BASH_PATTERN_OPERAND_TOOLS.has(argv0);
  // Read-tools whose remaining file operands are read candidates.
  const isReadTool = BASH_READ_TOOLS.has(argv0);
  // Generic write-emitter argv0.
  const isTee = argv0 === "tee";
  const isCp = argv0 === "cp";
  const isMv = argv0 === "mv";
  const isDd = argv0 === "dd";
  const isSed = argv0 === "sed";
  const isAwk = argv0 === "awk";

  // Sed -i flag detection (also `--in-place`).
  const sedInPlace = isSed && args.some((a) => /^-i(\b|$|=)/.test(unquoteToken(a)) || unquoteToken(a) === "--in-place");
  // Awk -i inplace pair detection.
  let awkInPlace = false;
  if (isAwk) {
    for (let k = 0; k < args.length - 1; k++) {
      const a = unquoteToken(args[k]);
      const b = unquoteToken(args[k + 1]);
      if (a === "-i" && b === "inplace") { awkInPlace = true; break; }
    }
  }

  // For grep/rg/ag, the first non-flag operand is the pattern; subsequent
  // operands are paths (read candidates). (`find` is handled by
  // parseFindArgs above — option semantics differ enough that it warrants
  // a dedicated parser per codex MEDIUM#1.)
  let grepPatternSeen = false;

  // Cp/mv positional accounting: last positional is destination (write),
  // earlier positionals are sources (read).
  const cpMvPositionals = [];

  // Iterate args, splitting out redirects.
  for (let i = 0; i < args.length; i++) {
    const tokRaw = args[i];
    if (!tokRaw) continue;

    // Redirect cases (operator with separate target token).
    const cls = classifyToken(tokRaw);
    // fd duplication / close: `<&n`, `<&-`, `>&n`, `>&-`, `\d+<&n`, etc. —
    // these manipulate fd tables, not files. Skip without emitting a
    // candidate (codex iter-2 HIGH-C edge case).
    if (cls.kind === "fd-dup") continue;
    // Here-string `<<<`: next operand is data, not a file (codex iter-4
    // MED-5). Consume both the marker and the data token without emitting.
    if (cls.kind === "here-string-next") { i++; continue; }
    if (cls.kind === "write-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "write", symbolTable);
      continue;
    }
    if (cls.kind === "write-target") {
      pushPathCandidates(tuples, cls.path, "write", symbolTable);
      continue;
    }
    if (cls.kind === "read-redirect-next") {
      pushPathCandidates(tuples, args[++i] || "", "read", symbolTable);
      continue;
    }
    if (cls.kind === "read-target") {
      pushPathCandidates(tuples, cls.path, "read", symbolTable);
      continue;
    }
    if (cls.kind !== "word") continue;

    // File-selector flags on rg/grep: scan the VALUE as a read candidate.
    // Supports both `--flag=value` (attached) and `--flag value` (separate).
    // Importantly, consuming this value here means it does NOT count as the
    // pattern-tool's regex/search literal, so `grepPatternSeen` stays false.
    //
    // We MUST inspect the unquoted token because shell strips quotes before
    // the program sees argv. `"--glob=.env.production*"` reaches rg as
    // `--glob=.env.production*`; without unquoting, the leading `"` defeats
    // the `startsWith("-")` guard and the value silently bypasses scanning.
    if (isPatternTool) {
      const tokForFlag = unquoteToken(tokRaw);
      const flagMatch = matchFileSelectorFlag(argv0, tokForFlag);
      if (flagMatch) {
        if (flagMatch.kind === "value-attached") {
          pushPathCandidates(tuples, flagMatch.value, "read", symbolTable);
        } else {
          // `--flag value` — consume the next operand as the value.
          pushPathCandidates(tuples, args[++i] || "", "read", symbolTable);
        }
        continue;
      }
    }

    const tok = unquoteToken(tokRaw);

    // tee writes to every non-flag operand.
    if (isTee && !tok.startsWith("-")) {
      pushPathCandidates(tuples, tokRaw, "write", symbolTable);
      continue;
    }

    // cp / mv: defer until we have all positionals, classify last as write.
    if ((isCp || isMv) && !tok.startsWith("-")) {
      cpMvPositionals.push(tokRaw);
      continue;
    }

    // dd: of=<path> is write, if=<path> is read.
    if (isDd) {
      const ofM = tok.match(/^of=(.+)$/);
      if (ofM) { pushPathCandidates(tuples, ofM[1], "write", symbolTable); continue; }
      const ifM = tok.match(/^if=(.+)$/);
      if (ifM) { pushPathCandidates(tuples, ifM[1], "read", symbolTable); continue; }
      continue;
    }

    // sed -i / awk -i inplace: trailing non-flag, non-script operand is the
    // file being modified in place.
    if ((sedInPlace || awkInPlace) && !tok.startsWith("-") && i === args.length - 1) {
      pushPathCandidates(tuples, tokRaw, "write", symbolTable);
      continue;
    }

    // Pattern-tool: first non-flag arg is the pattern (skipped), rest are
    // read candidates.
    if (isPatternTool && !tok.startsWith("-")) {
      if (!grepPatternSeen) {
        grepPatternSeen = true;
        continue; // skip the pattern operand entirely
      }
      // Subsequent operands are paths — read candidates only.
      pushPathCandidates(tuples, tokRaw, "read", symbolTable);
      continue;
    }

    // Generic read-tools (cat/head/tail/...): non-flag args are read paths.
    // Tag with intent: "internal" — these tools emit content to stdout in the
    // local session, never to external systems. checkPrivacy downgrades these
    // matches to advisory rather than blocking.
    if (isReadTool && !tok.startsWith("-")) {
      pushPathCandidates(tuples, tokRaw, "read", symbolTable, "internal");
      continue;
    }
  }

  // Resolve cp/mv positionals: last is destination (write), rest are read.
  if (cpMvPositionals.length >= 2) {
    const dest = cpMvPositionals[cpMvPositionals.length - 1];
    const sources = cpMvPositionals.slice(0, -1);
    for (const s of sources) pushPathCandidates(tuples, s, "read", symbolTable);
    pushPathCandidates(tuples, dest, "write", symbolTable);
  } else if (cpMvPositionals.length === 1) {
    // Single arg cp/mv — odd but treat as read (no clear destination).
    pushPathCandidates(tuples, cpMvPositionals[0], "read", symbolTable);
  }
}

/**
 * Collapse simple single-token variable references like `$ENV_FILE` or
 * `${ENV_FILE}`. Checks the statement-local symbol table first (populated by
 * leading `name=value` assignments in `parseBashSegment`), then falls back
 * to `process.env`. We deliberately do NOT attempt complex shell expansion;
 * this best-effort pass exists so user-provided paths like
 * `f=.env.production; cat $f` or `tee $ENV_FILE` can be matched against
 * sensitive patterns. If the variable is unset in both places, returns the
 * raw token.
 */
function expandSimpleVar(tok, symbolTable) {
  if (!tok) return tok;
  // Whole-token $VAR or ${VAR}
  const m = tok.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
  if (m) {
    const name = m[1];
    if (symbolTable && symbolTable.has(name)) {
      const local = symbolTable.get(name);
      if (typeof local === "string" && local.length > 0) return local;
    }
    const val = process.env[name];
    return typeof val === "string" && val.length > 0 ? val : tok;
  }
  return tok;
}

/**
 * Tool-aware candidate extraction. Returns [{ path, operation }] tuples.
 *
 * Per Step 1 contract:
 *   - Read/Write/Edit/MultiEdit/NotebookEdit: scan file_path (or notebook_path) only.
 *   - Grep: scan path + glob; NEVER pattern.
 *   - Glob: scan path; NEVER pattern.
 *   - LS: scan path only.
 *   - Bash: tool-aware parse via parseBashCandidates.
 */
function extractCandidates(toolName, toolInput) {
  if (!toolInput) return [];

  if (toolName === "Bash") {
    return parseBashCandidates(String(toolInput.command || ""));
  }

  if (toolName === "Read") {
    const p = toolInput.file_path;
    return p ? [{ path: String(p), operation: "read" }] : [];
  }
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    const p = toolInput.file_path;
    return p ? [{ path: String(p), operation: "write" }] : [];
  }
  if (toolName === "NotebookEdit") {
    const p = toolInput.notebook_path || toolInput.file_path;
    return p ? [{ path: String(p), operation: "write" }] : [];
  }
  if (toolName === "Grep") {
    const out = [];
    if (toolInput.path) out.push({ path: String(toolInput.path), operation: "read" });
    if (toolInput.glob) out.push({ path: String(toolInput.glob), operation: "read" });
    return out;
  }
  if (toolName === "Glob") {
    return toolInput.path ? [{ path: String(toolInput.path), operation: "read" }] : [];
  }
  if (toolName === "LS") {
    return toolInput.path ? [{ path: String(toolInput.path), operation: "read" }] : [];
  }

  // Unknown tools: be conservative — no candidates.
  return [];
}

function isSensitive(value, compiledEntries) {
  const cleaned = String(value).replace(/\\/g, "/");
  const base = path.basename(cleaned);
  if (SAFE_SUFFIXES.test(base)) return null;
  for (const entry of compiledEntries) {
    if (entry.regex.test(cleaned) || entry.regex.test(base)) {
      return entry;
    }
  }
  return null;
}

/**
 * Decide whether an existing approval covers this match.
 *
 * approvals shape: { privacyApprovals: string[], categoryApprovals: [{category, operation, grantedAt}] }
 *
 * Rules (per plan.md:68-71):
 *   - categoryApproval matches if entry.category === match.category AND
 *     (entry.operation === match.operation
 *      OR entry.operation === "both"
 *      OR (entry.operation === "write" AND match.operation === "read"))
 *   - Legacy bare-string per-path entries authorize only reads, only when the
 *     entry string equals match.filePath.
 */
function isApproved(match, approvals) {
  if (!match || !match.blocked) return false;
  const bundle = approvals || {};
  const categoryApprovals = Array.isArray(bundle.categoryApprovals) ? bundle.categoryApprovals : [];
  const privacyApprovals = Array.isArray(bundle.privacyApprovals) ? bundle.privacyApprovals : [];

  for (const entry of categoryApprovals) {
    if (!entry || entry.category !== match.category) continue;
    const op = entry.operation;
    if (op === match.operation) return true;
    if (op === "both") return true;
    if (op === "write" && match.operation === "read") return true;
  }

  if (match.operation === "read") {
    const cleaned = String(match.filePath).replace(/\\/g, "/");
    for (const legacy of privacyApprovals) {
      if (String(legacy).replace(/\\/g, "/") === cleaned) return true;
    }
  }

  return false;
}

let _compiledEntriesCache;
let _compiledEntriesCacheKey;

function compileEntries(entries) {
  const key = entries.map((e) => `${e.pattern}|${e.category}`).join("\0");
  if (_compiledEntriesCacheKey === key && _compiledEntriesCache) {
    return _compiledEntriesCache;
  }
  _compiledEntriesCache = entries.map((e) => ({
    pattern: e.pattern,
    category: e.category || "uncategorized",
    regex: globToRegex(e.pattern)
  }));
  _compiledEntriesCacheKey = key;
  return _compiledEntriesCache;
}

/**
 * Resolve the entries to compile from one of two inputs (back-compat):
 *   - sensitivePatternEntries: [{pattern, category}, ...] (preferred)
 *   - sensitivePatterns: ["pat", ...] (legacy; assigned category "uncategorized")
 */
function resolveEntries({ sensitivePatternEntries, sensitivePatterns }) {
  if (Array.isArray(sensitivePatternEntries) && sensitivePatternEntries.length > 0) {
    return sensitivePatternEntries.map((e) => ({
      pattern: e.pattern,
      category: e.category || "uncategorized"
    }));
  }
  if (Array.isArray(sensitivePatterns) && sensitivePatterns.length > 0) {
    return sensitivePatterns.map((p) => ({ pattern: p, category: "uncategorized" }));
  }
  return [];
}

/**
 * checkPrivacy: tool-aware sensitive-file check.
 *
 * args = {
 *   toolName: string,
 *   toolInput: object,
 *   sensitivePatternEntries?: [{pattern, category}],
 *   sensitivePatterns?: string[],         // legacy back-compat
 *   approvals?: { privacyApprovals, categoryApprovals }, // preferred
 *   approvedFiles?: string[]              // legacy back-compat
 * }
 *
 * Returns:
 *   { blocked: true, filePath, category, approvalScope: "session", operation }
 *   { blocked: false }
 */
function checkPrivacy(args) {
  const {
    toolName,
    toolInput,
    sensitivePatternEntries,
    sensitivePatterns,
    approvals,
    approvedFiles
  } = args || {};

  const entries = compileEntries(resolveEntries({ sensitivePatternEntries, sensitivePatterns }));
  // Back-compat: accept legacy approvedFiles array as privacyApprovals.
  const approvalBundle = approvals
    ? approvals
    : { privacyApprovals: Array.isArray(approvedFiles) ? approvedFiles : [], categoryApprovals: [] };

  const candidates = extractCandidates(toolName, toolInput);
  let firstAdvisory = null;
  for (const cand of candidates) {
    const hit = isSensitive(cand.path, entries);
    if (!hit) continue;

    // Severity: Bash internal-read tools (cat/head/tail/wc/...) emit content
    // to the local session stdout — informational, not a leak. Mark advisory
    // so the consumer can surface a soft warning. Hard block stays for Read
    // tool, writes, and any candidate without "internal" intent (cp src,
    // dd if=, find -newer, redirects, ...). The `blocked: true` flag is kept
    // for advisory matches so existing parser-detection tests still see a
    // positive match — consumers must check `severity` to choose action.
    const severity = cand.intent === "internal" ? "advisory" : "hard";

    const match = {
      blocked: true,
      severity,
      filePath: cand.path,
      category: hit.category,
      approvalScope: "session",
      operation: cand.operation
    };
    if (cand.intent) match.intent = cand.intent;

    if (isApproved(match, approvalBundle)) continue;

    if (severity === "advisory") {
      if (!firstAdvisory) firstAdvisory = match;
      continue;
    }

    return match;
  }

  return firstAdvisory || { blocked: false };
}

module.exports = {
  checkPrivacy,
  // Exposed for unit tests
  extractCandidates,
  isApproved,
  parseBashCandidates
};
