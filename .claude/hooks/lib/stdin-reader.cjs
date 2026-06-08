/**
 * Safe stdin reader with truncation detection.
 * Reads from fd 0 up to maxBytes, returning truncation metadata.
 * Security-sensitive hooks should block when input is truncated
 * to prevent bypass via large payloads.
 *
 * @param {number} [maxBytes=1048576] - Maximum bytes to read (default 1MB)
 * @returns {{ data: string, truncated: boolean, originalSize: number }}
 */

const fs = require("fs");

function readStdinSafe(maxBytes = 1_048_576) {
  // Note: fs.readFileSync(0) reads the full stream into memory.
  // Truncation is applied post-read. True streaming truncation would
  // require fd-level read() loops — complexity not justified for hook payloads
  // that are typically <100KB. The security contract (block on truncated) holds.
  let buffer;
  try {
    buffer = fs.readFileSync(0);
  } catch {
    return { data: "", truncated: false, originalSize: 0 };
  }

  if (!buffer || buffer.length === 0) {
    return { data: "", truncated: false, originalSize: 0 };
  }

  const originalSize = buffer.length;
  const truncated = originalSize > maxBytes;

  if (truncated) {
    process.env.PREP_HOOK_INPUT_TRUNCATED = "1";
    process.env.PREP_HOOK_INPUT_MAX_BYTES = String(maxBytes);
  }

  const data = truncated
    ? buffer.slice(0, maxBytes).toString("utf8")
    : buffer.toString("utf8");

  return { data, truncated, originalSize };
}

module.exports = { readStdinSafe };
