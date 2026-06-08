import path from "node:path";
import { readJson, resolveRelativePath } from "./fs-utils.mjs";
import { deriveBrowserPaths } from "./defaults.mjs";

function defaultArtifactsDir(specDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(specDir, ".prepkit", "browser-artifacts", stamp);
}

function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error("Browser spec must include a non-empty actions array");
  }
}

function resolveActionPaths(actions, specDir) {
  return actions.map((action, index) => {
    if (!action || typeof action !== "object") {
      throw new Error(`Action ${index + 1} must be an object`);
    }
    if (!action.type) {
      throw new Error(`Action ${index + 1} is missing type`);
    }

    return {
      ...action,
      path: resolveRelativePath(specDir, action.path)
    };
  });
}

export function loadBrowserSpec(specPath, options = {}) {
  const absoluteSpecPath = path.resolve(specPath);
  const specDir = path.dirname(absoluteSpecPath);
  const rawSpec = readJson(absoluteSpecPath);
  const derivedPaths = deriveBrowserPaths({
    cwd: options.cwd,
    specPath: absoluteSpecPath,
    outputPath: resolveRelativePath(specDir, options.output || rawSpec.outputPath),
    markdownOutputPath: resolveRelativePath(specDir, options.markdownOutput || rawSpec.markdownOutputPath),
    artifactsDir: resolveRelativePath(specDir, options.artifactsDir || rawSpec.artifactsDir),
    saveStorageStatePath: resolveRelativePath(specDir, options.storageState || rawSpec.saveStorageStatePath),
    allowDefaultStorageState: options.allowDefaultStorageState === true
  });

  validateActions(rawSpec.actions);

  return {
    browser: rawSpec.browser || "chromium",
    headless: rawSpec.headless !== false,
    baseUrl: rawSpec.baseUrl || null,
    startUrl: rawSpec.startUrl || null,
    artifactsDir: derivedPaths.artifactsDir || defaultArtifactsDir(specDir),
    outputPath: derivedPaths.outputPath,
    markdownOutputPath: derivedPaths.markdownOutputPath,
    storageStatePath: resolveRelativePath(specDir, rawSpec.storageStatePath),
    saveStorageStatePath: derivedPaths.saveStorageStatePath,
    viewport: rawSpec.viewport || { width: 1440, height: 900 },
    capture: {
      console: rawSpec.capture?.console !== false,
      network: rawSpec.capture?.network !== false,
      pageErrors: rawSpec.capture?.pageErrors !== false
    },
    planDefaults: derivedPaths.planDefaults,
    actions: resolveActionPaths(rawSpec.actions, specDir)
  };
}
