const path = require("path");

function resolveConfiguredPath(root, configuredPath) {
  if (!configuredPath) {
    return root;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(root, configuredPath);
}

function isPathWithin(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

module.exports = {
  isPathWithin,
  resolveConfiguredPath
};
