const fs = require("fs");
const path = require("path");

function resolveFromRoot(root, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

function cliManifestArg(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--manifest");
  if (index === -1) {
    return "";
  }

  return argv[index + 1] || "";
}

function activeManifestRelativePath() {
  return path.join(".prepkit", "active.manifest.json");
}

function activeManifestPath(root) {
  return path.join(root, activeManifestRelativePath());
}

function resolveBuildManifestPath(root, argv = process.argv.slice(2), env = process.env) {
  const explicitPath = env.PREPKIT_MANIFEST_PATH || cliManifestArg(argv);
  if (explicitPath) {
    return resolveFromRoot(root, explicitPath);
  }

  return path.join(root, ".prepkit", "kit.manifest.json");
}

function resolveRuntimeManifestPath(root, argv = process.argv.slice(2), env = process.env) {
  const explicitPath = env.PREPKIT_MANIFEST_PATH || cliManifestArg(argv);
  if (explicitPath) {
    return resolveFromRoot(root, explicitPath);
  }

  const activePath = activeManifestPath(root);
  if (fs.existsSync(activePath)) {
    return activePath;
  }

  return path.join(root, ".prepkit", "kit.manifest.json");
}

module.exports = {
  activeManifestPath,
  activeManifestRelativePath,
  cliManifestArg,
  resolveBuildManifestPath,
  resolveRuntimeManifestPath
};
