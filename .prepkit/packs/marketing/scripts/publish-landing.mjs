#!/usr/bin/env node
// publish-landing.mjs — deterministic engine that takes a built landing page from
// assets/landing/<slug>/ and publishes it live via the Cloudflare Workers (Static Assets) publish repo.
//
// Flow (direct-to-live, claims-gated):
//   0. --preflight: claims gate + publish-repo access probe (git ls-remote, no clone, no writes) —
//      the skill runs this BEFORE asking the human "đăng đi?", so the kit never promises a publish
//      it cannot deliver (gate fail OR a machine without repo credentials/permission).
//   1. Run the EXISTING claims gate (claims-check.sh --mode publish) — abort on FAIL.
//   2. Sync a local working clone of the publish repo (clone or fetch).
//   3. Export the page folder (HTML + policy pages + images) into <locale>/<slug>/,
//      write publish-meta.json (provenance the CI gate checks), drop internal-only files (copy.md/.md).
//   4. Commit + push the production branch -> Cloudflare deploys it LIVE at <subdomain>/<locale>/<slug>/.
//   --init scaffolds an empty publish repo (wrangler.jsonc, .assetsignore, CI gate, apex index).
//
// The skill/command drives this; the marketer never sees git or Cloudflare.
// Config comes from context/marketing.config.json -> publish{} (never hardcoded).
//
// Usage:
//   node publish-landing.mjs --slug <slug> [--locale vi] [--market VN] [--page-dir <path>]
//                            [--preflight] [--dry-run] [--json]
//   node publish-landing.mjs --init    (one-time: scaffold + push the publish repo)
//   Exit 0 = OK, 1 = gate/operation failed, 2 = usage/config error.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PREP_KIT_ROOT
  ? path.resolve(process.env.PREP_KIT_ROOT)
  : path.resolve(__dirname, "../../../../");

// ---- args -----------------------------------------------------------------
function parseArgs(argv) {
  const a = { dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--slug") a.slug = argv[++i];
    else if (t === "--locale") a.locale = argv[++i];
    else if (t === "--market") a.market = argv[++i];
    else if (t === "--page-dir") a.pageDir = argv[++i];
    else if (t === "--preflight") a.preflight = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--init") a.init = true;
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") a.help = true;
  }
  return a;
}

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

// run a command, return stdout; throw with captured output on failure.
// GIT_TERMINAL_PROMPT=0 everywhere: on a machine without credentials git must FAIL FAST with a clear
// error, never hang waiting for a username on a prompt nobody can see (callers may still override).
function run(cmd, cmdArgs, opts = {}) {
  const { env: optEnv, ...rest } = opts;
  return execFileSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...rest,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(optEnv || {}) },
  });
}
const git = (cwd, ...g) => run("git", ["-C", cwd, ...g]).trim();

// Read-access probe for the publish repo — NO clone, no writes. Read access on a private repo is the
// preflight proxy for "this account was added by the maintainer"; push failures still die loudly later.
function checkRemoteAccess(remote) {
  try {
    run("git", ["ls-remote", "--heads", remote], { timeout: 30000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: `${e.stderr || e.message || e}`.trim().slice(0, 500) };
  }
}

// Fresh teammate machines often have gh credentials but no git identity — `git commit` would die with
// "Please tell me who you are". Fall back to a kit identity ONLY when the checkout has none configured.
function commitIdFlags(co) {
  try { if (git(co, "config", "user.email")) return []; } catch { /* unset → exit 1 → fall through */ }
  return ["-c", "user.name=PrepKit Publisher", "-c", "user.email=publish@prepkit.local"];
}

// ---- config ---------------------------------------------------------------
function loadConfig() {
  const p = path.join(ROOT, "context", "marketing.config.json");
  if (!fs.existsSync(p)) die(2, `config not found: ${p} (run /mkt-setup first)`);
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  const pub = cfg.publish || {};
  if (!pub.repo || !pub.repo.remote) {
    die(2, "config.publish.repo.remote is not set — finish the one-time Phase-0 setup, then set it in context/marketing.config.json.");
  }
  const primaryLocale = cfg.primaryLocale || "vi-VN";
  return {
    market: (cfg.primaryMarket || "VN").toUpperCase(),
    subdomain: pub.subdomain || "lp.example.com",
    projectName: pub.projectName || "landing",
    defaultLocale: (pub.localeSegment || primaryLocale.split("-")[0] || "vi").toLowerCase(),
    remote: pub.repo.remote,
    productionBranch: pub.repo.productionBranch || "main",
    checkout: path.isAbsolute(pub.repo.localCheckout || "")
      ? pub.repo.localCheckout
      : path.join(ROOT, pub.repo.localCheckout || ".prepkit/.publish-cache/landing"),
  };
}

// ---- claims gate (reuse the existing deterministic gate) -------------------
function runGate(copyFile, market) {
  const gate = path.join(ROOT, ".prepkit/packs/marketing/gates/scripts/claims-check.sh");
  if (!fs.existsSync(gate)) die(1, `claims gate not found: ${gate}`);
  try {
    const out = run("bash", [gate, copyFile, "--mode", "publish", "--market", market], {
      cwd: ROOT,
      env: { ...process.env, PREP_KIT_ROOT: ROOT },
    });
    return { passed: true, output: out };
  } catch (e) {
    return { passed: false, output: `${e.stdout || ""}${e.stderr || ""}`.trim() };
  }
}

// snapshot the claims referenced in the copy, for the provenance file CI validates
function snapshotClaims(copyText) {
  const claimsPath = path.join(ROOT, "context", "claims.json");
  const raw = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.claims || [];
  const byId = Object.fromEntries(list.map((c) => [c.claim_id, c]));
  const ids = [...new Set([...copyText.matchAll(/\[\[(CLM-\d+)\]\]/g)].map((m) => m[1]))];
  return ids.map((id) => {
    const c = byId[id] || {};
    return { id, status: c.status || "unknown", market: c.market || "", expiry: c.expiry || "" };
  });
}

// ---- export ---------------------------------------------------------------
// Copy the page folder into the publish repo, EXCLUDING internal-only files.
// copy.md and report/markdown stay in the kit; they must not be served publicly.
function exportPage(pageDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(pageDir, targetDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (base === "copy.md") return false; // internal source copy — never publish
      if (base.endsWith(".md")) return false; // notes/reports stay in the kit
      return true;
    },
  });
}

// Seed the publish repo's CI gate + config on first publish (idempotent). Returns seeded paths.
// Templates use a .tmpl suffix so the kit's own tooling never runs them; _headers keeps that exact
// (Cloudflare-required) name on seed.
const TEMPLATE_DIR = path.join(__dirname, "../skills/domain/marketing-publish/publish-repo-template");
const TEMPLATE_MAP = {
  "wrangler.jsonc.tmpl": "wrangler.jsonc",            // Workers Static Assets config (npx wrangler deploy)
  ".assetsignore.tmpl": ".assetsignore",              // keep .git / config / CI files OUT of the served site
  "verify-publish.mjs.tmpl": "verify-publish.mjs",
  "worker-index.js.tmpl": "worker/index.js",          // the Worker: serves assets + POST /api/lead form backend
  "publish-gate.yml.tmpl": ".github/workflows/publish-gate.yml",
  "README.md.tmpl": "README.md",
  "_headers.tmpl": "_headers",
  "root-index.html.tmpl": "index.html",              // apex page at https://<subdomain>/
};
function seedTemplateIfMissing(co, cfg, force = false) {
  if (!force && fs.existsSync(path.join(co, "verify-publish.mjs"))) return [];
  const subs = { __SUBDOMAIN__: cfg.subdomain, __PROJECT__: cfg.projectName };
  const seeded = [];
  for (const [tmpl, dest] of Object.entries(TEMPLATE_MAP)) {
    const src = path.join(TEMPLATE_DIR, tmpl);
    if (!fs.existsSync(src)) continue;
    let content = fs.readFileSync(src, "utf8");
    for (const [k, v] of Object.entries(subs)) content = content.split(k).join(v);
    const out = path.join(co, dest);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
    seeded.push(dest);
  }
  return seeded;
}

// Large image-bearing pushes fail over HTTP/2 ("RPC failed; HTTP 400 / send-pack disconnect");
// force HTTP/1.1 + a big post buffer on the checkout so pushes that include assets succeed.
function ensureGitConfig(co) {
  try {
    git(co, "config", "http.version", "HTTP/1.1");
    git(co, "config", "http.postBuffer", "524288000");
  } catch {}
}

// ---- init (one-time: scaffold + push the publish repo) --------------------
function initRepo(cfg, a) {
  const co = cfg.checkout;
  if (!fs.existsSync(path.join(co, ".git"))) {
    fs.mkdirSync(path.dirname(co), { recursive: true });
    try { run("git", ["clone", cfg.remote, co]); }
    catch (e) { die(1, `could not clone publish repo (${cfg.remote}). Create it on GitHub + check push access.\n${e.stderr || e.message}`); }
  }
  ensureGitConfig(co);
  try { git(co, "fetch", "--prune", "origin"); } catch {}
  try { git(co, "checkout", "-B", cfg.productionBranch, `origin/${cfg.productionBranch}`); }
  catch { git(co, "checkout", "-B", cfg.productionBranch); }
  const seeded = seedTemplateIfMissing(co, cfg, true);
  git(co, "add", "-A");
  try { git(co, ...commitIdFlags(co), "commit", "-m", "chore: initialize publish repo (Cloudflare static assets + CI gate)"); }
  catch { /* nothing to commit — already initialized */ }
  try { git(co, "push", "-u", "origin", cfg.productionBranch); }
  catch (e) { die(1, `push failed to ${cfg.remote} — check your git push access.\n${e.stderr || e.message}`); }
  const result = { ok: true, init: true, project: cfg.projectName, branch: cfg.productionBranch, seeded };
  console.log(a.json ? JSON.stringify(result, null, 2)
    : `✓ Initialized "${cfg.projectName}" on ${cfg.productionBranch} (seeded ${seeded.length} files).\n  Next: in Cloudflare, Retry build. Site root will be https://${cfg.subdomain}/`);
}

// ---- main -----------------------------------------------------------------
function main() {
  const a = parseArgs(process.argv.slice(2));
  const USAGE = "usage: publish-landing.mjs --slug <slug> [--locale vi] [--market VN] [--page-dir <path>] [--preflight] [--dry-run] [--json]\n       publish-landing.mjs --init   (one-time: scaffold + push the publish repo)";
  if (a.help) die(0, USAGE);
  const cfg = loadConfig();
  if (a.init) { initRepo(cfg, a); return; }
  if (!a.slug) die(2, USAGE);
  const locale = (a.locale || cfg.defaultLocale).toLowerCase();
  const market = (a.market || cfg.market).toUpperCase(); // per-page market (e.g. a th page gates against TH claims)
  const slug = a.slug;
  const pageDir = a.pageDir ? path.resolve(a.pageDir) : path.join(ROOT, "assets/landing", slug);
  const liveUrl = `https://${cfg.subdomain}/${locale}/${slug}/`;

  // validate inputs
  const indexHtml = path.join(pageDir, "index.html");
  if (!fs.existsSync(indexHtml)) die(2, `no landing page at ${pageDir} (expected index.html). Build it with /mkt-build-landing-page first.`);
  const copyFile = path.join(pageDir, "copy.md");
  if (!fs.existsSync(copyFile)) die(2, `no copy.md at ${pageDir} — the claims gate needs the tagged copy. Re-run the build.`);

  // (1) GATE — the primary enforcement. Nothing leaves the kit if claims aren't approved.
  const gate = runGate(copyFile, market);

  // (preflight) — gate + remote access reported TOGETHER, zero side effects. The skill runs this
  // before the human is asked to confirm, so "đăng đi là lên mạng ngay" is only ever promised when true.
  if (a.preflight) {
    const remote = checkRemoteAccess(cfg.remote);
    const ok = gate.passed && remote.ok;
    const result = {
      ok, preflight: true, slug, locale, market,
      gatePassed: gate.passed, remoteAccess: remote.ok,
      targetPath: `${locale}/${slug}/`, liveUrl,
      ...(gate.passed ? {} : { gateOutput: gate.output }),
      ...(remote.ok ? {} : { remoteDetail: remote.detail }),
    };
    if (a.json) console.log(JSON.stringify(result, null, 2));
    else if (ok) console.log(`✓ PREFLIGHT ok — claims gate passed + publish repo reachable.\n  ready to publish to: ${liveUrl}`);
    else {
      const why = [
        gate.passed ? null : `claims gate FAILED:\n${gate.output}`,
        remote.ok ? null : `publish repo not accessible from this machine (${cfg.remote}):\n${remote.detail}`,
      ].filter(Boolean).join("\n\n");
      console.log(`✗ PREFLIGHT failed — not ready to publish.\n${why}`);
    }
    process.exit(ok ? 0 : 1);
  }

  if (!gate.passed) {
    console.error("✗ Claims gate FAILED — not published. Approve the claims below in context/claims.md, then retry.\n");
    console.error(gate.output);
    process.exit(1);
  }
  const meta = {
    slug, locale, market,
    subdomain: cfg.subdomain, url: liveUrl,
    builtAt: new Date().toISOString(),
    gate: { passed: true, mode: "publish", tool: "claims-check.sh" },
    claims: snapshotClaims(fs.readFileSync(copyFile, "utf8")),
    generatedBy: "publish-landing.mjs",
  };

  // (dry run) — verify gate + export locally without touching the remote
  if (a.dryRun) {
    const target = path.join(ROOT, ".prepkit/.publish-cache/_dryrun", locale, slug);
    exportPage(pageDir, target);
    fs.writeFileSync(path.join(target, "publish-meta.json"), JSON.stringify(meta, null, 2) + "\n");
    const result = { ok: true, dryRun: true, slug, locale, exportedTo: target, liveUrl, gatePassed: true };
    console.log(a.json ? JSON.stringify(result, null, 2) : `✓ DRY RUN ok — gate passed, page exported to ${target}\n  would go live at: ${liveUrl}`);
    return;
  }

  // (2) SYNC the publish-repo working clone
  const co = cfg.checkout;
  if (!fs.existsSync(path.join(co, ".git"))) {
    fs.mkdirSync(path.dirname(co), { recursive: true });
    try { run("git", ["clone", cfg.remote, co]); }
    catch (e) { die(1, `could not clone publish repo (${cfg.remote}). Check Phase-0 setup + push access.\n${e.stderr || e.message}`); }
  }
  ensureGitConfig(co);
  try { git(co, "fetch", "--prune", "origin"); }
  catch (e) { die(1, `git fetch failed in ${co}\n${e.stderr || e.message}`); }

  // (3) PUBLISH LIVE — export onto the production branch and push; Cloudflare deploys it.
  try { git(co, "checkout", "-B", cfg.productionBranch, `origin/${cfg.productionBranch}`); }
  catch { git(co, "checkout", "-B", cfg.productionBranch); } // first publish ever (empty repo)
  const seeded = seedTemplateIfMissing(co, cfg);
  const target = path.join(co, locale, slug);
  exportPage(pageDir, target);
  fs.writeFileSync(path.join(target, "publish-meta.json"), JSON.stringify(meta, null, 2) + "\n");
  try {
    if (seeded.length) git(co, "add", "-A");
    else git(co, "add", "--", `${locale}/${slug}`);
    git(co, ...commitIdFlags(co), "commit", "-m", `publish: ${locale}/${slug}`);
  } catch (e) {
    die(1, `nothing to commit — this exact page is already published (no changes to deploy).\n${e.stderr || e.message}`);
  }
  try {
    git(co, "push", "origin", cfg.productionBranch);
  } catch (e) {
    die(1, `push failed — check push access to ${cfg.remote}.\n${e.stderr || e.message}`);
  }
  const result = { ok: true, published: true, slug, locale, liveUrl, gatePassed: true };
  console.log(a.json ? JSON.stringify(result, null, 2) : `✓ PUBLISHED — ${liveUrl}\n  (Cloudflare deploys from ${cfg.productionBranch}; allow ~1 min, then hard-refresh.)`);
}

main();
