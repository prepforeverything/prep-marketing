/**
 * GitButler hook-payload capture shim.
 *
 * When the marker file `.prepkit/gitbutler-capture.on` exists at the kit
 * root, this module reads the raw Claude hook stdin and writes it to
 * `tests/fixtures/gitbutler-hook-payloads/live-<phase>-<timestamp>-<rand>.json`.
 *
 * Call `captureIfActive(phase)` as the very first action in a dispatcher's
 * `main()`. If it returns `true`, the caller should return immediately — the
 * dispatcher is in capture mode and stdin has already been consumed.
 *
 * This is opt-in and has no effect when the marker file is absent. It exists
 * so that real Claude Code hook payloads can be captured from a running
 * session for phase-1b forwarding compatibility validation without forcing
 * dispatcher authors to maintain a separate capture pipeline.
 */

const fs = require("fs");
const path = require("path");

function findKitRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, ".prepkit", "kit.manifest.json"))) {
      return dir;
    }
    if (dir === root) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function captureIfActive(phase) {
  let stdinConsumed = false;
  try {
    const kitRoot = findKitRoot(process.cwd());
    if (!kitRoot) return false;

    const markerPath = path.join(kitRoot, ".prepkit", "gitbutler-capture.on");
    if (!fs.existsSync(markerPath)) return false;

    // Capture is active — consume stdin and write fixture.
    const { readStdinSafe } = require("./stdin-reader.cjs");
    const { data } = readStdinSafe();
    stdinConsumed = true;

    const captureDir = path.join(kitRoot, "tests", "fixtures", "gitbutler-hook-payloads");
    fs.mkdirSync(captureDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `live-${phase}-${ts}-${rand}.json`;

    fs.writeFileSync(path.join(captureDir, filename), data || "", "utf8");
    return true;
  } catch {
    // Pre-stdin errors (findKitRoot, existsSync) should let the dispatcher
    // proceed normally — return false so it reads stdin and runs evaluators.
    // Post-stdin errors cannot be recovered (stdin is already drained), so
    // return true and let the dispatcher exit cleanly. Without this guard
    // the previous unconditional `return true` swallowed every fs error
    // while the capture marker was set, silently skipping the hook pipeline.
    return stdinConsumed;
  }
}

module.exports = {
  captureIfActive,
  findKitRoot
};
