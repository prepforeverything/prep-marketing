function applyArtifactCap(text, cap, relPath) {
  if (!text || text.length <= cap) return text;
  return text.slice(0, cap).trimEnd() + `\n... (truncated — see ${relPath})`;
}

module.exports = { applyArtifactCap };
