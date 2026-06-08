import fs from "node:fs";
import path from "node:path";
import { scaffoldPrepkit, runBuildKit } from "./prepkit-scaffold.mjs";
import { readPackSelection } from "./preset-config-esm.mjs";

/**
 * Refresh an existing project's kit files after a PrepKit source update.
 *
 * @param {object} opts
 * @param {string} opts.kitRoot    - Project directory containing kit.manifest.json
 * @param {string} opts.sourceRoot - PrepKit installation root (source files)
 * @param {boolean} [opts.force]   - Overwrite even non-generated files
 * @param {boolean} [opts.silent]  - Suppress console output
 * @returns {{ refreshed: boolean, kitRoot: string, filesUpdated: object }}
 */
export function refreshProject({ kitRoot, sourceRoot, force = false, silent = false }) {
  const manifestPath = path.join(kitRoot, ".prepkit", "kit.manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No .prepkit/kit.manifest.json found in ${kitRoot}. Run 'prepkit init' first.`);
  }

  const log = silent ? () => {} : console.log;

  const packSelection = readPackSelection(kitRoot);

  const results = scaffoldPrepkit({
    sourceRoot,
    targetRoot: kitRoot,
    mode: "init",
    force,
    log
  });

  const buildSelection = {};
  if (packSelection?.preset) {
    buildSelection.preset = packSelection.preset;
  } else if (Array.isArray(packSelection?.selectedPacks) && packSelection.selectedPacks.length > 0) {
    buildSelection.selectedPacks = packSelection.selectedPacks;
  }

  runBuildKit(kitRoot, buildSelection);

  // Sync retrieval-sidecar adapter config if prepkit-memory MCP is registered
  // but the adapter config file is missing (e.g., installed before this fix).
  syncMemoryAdapterConfig(kitRoot, log);

  return { refreshed: true, kitRoot, filesUpdated: results };
}

/**
 * If prepkit-memory is registered as an MCP server in .claude/settings.json
 * but .prepkit/optional-adapters/retrieval-sidecar.json is missing, create it.
 * This bridges installs that registered MCP but missed the adapter config.
 */
function syncMemoryAdapterConfig(kitRoot, log = () => {}) {
  const adapterPath = path.join(kitRoot, ".prepkit", "optional-adapters", "retrieval-sidecar.json");
  if (fs.existsSync(adapterPath)) return;

  // Check if MCP server is registered
  const settingsPath = path.join(kitRoot, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;

  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { return; }
  const mcpEntry = settings.mcpServers?.["prepkit-memory"];
  if (!mcpEntry) {
    // Check if sibling prepkit-memory exists — recommend install
    const siblingDir = path.resolve(kitRoot, "..", "prepkit-memory");
    if (fs.existsSync(siblingDir)) {
      log("  prepkit-memory detected at ../prepkit-memory but not configured.");
      log("  Run install.sh again or add mcpServers['prepkit-memory'] to .claude/settings.json");
    }
    return;
  }

  // MCP is registered but adapter config is missing — create it
  const adapterDir = path.dirname(adapterPath);
  fs.mkdirSync(adapterDir, { recursive: true });
  const serverPath = Array.isArray(mcpEntry.args) ? mcpEntry.args[0] : "";
  fs.writeFileSync(adapterPath, JSON.stringify({
    enabled: true,
    serverPath,
    projectRoot: mcpEntry.env?.PREPKIT_PROJECT_ROOT || kitRoot,
    configuredAt: new Date().toISOString()
  }, null, 2) + "\n");
  log("  Created retrieval-sidecar adapter config (prepkit-memory MCP was registered but adapter config was missing)");
}
