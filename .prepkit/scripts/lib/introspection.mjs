// Shared helpers for the `prepkit skills | agents | manifest` introspection
// subcommands. Every function in this module is a pure reader over the
// resolved manifest on disk — none of them mutate state or call into
// build-kit.mjs. Keeping the logic here lets .prepkit/scripts/prepkit-cli.mjs stay a
// thin dispatch shell and satisfies the `loc-awareness` rule.

import fs from "node:fs";
import path from "node:path";

const RESOLVED_MANIFEST_REL = path.join(".prepkit", "active.manifest.json");
const RAW_MANIFEST_REL = path.join(".prepkit", "kit.manifest.json");

export function readResolvedManifest(kitRoot) {
  const filePath = path.join(kitRoot, RESOLVED_MANIFEST_REL);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Resolved manifest not found at ${RESOLVED_MANIFEST_REL}. ` +
        "Run `prepkit build` first."
    );
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Resolved manifest is not valid JSON (${RESOLVED_MANIFEST_REL}): ${error.message}. ` +
        "Rerun `prepkit build` to regenerate it."
    );
  }
}

export function readRawManifest(kitRoot) {
  const filePath = path.join(kitRoot, RAW_MANIFEST_REL);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Core manifest not found at ${RAW_MANIFEST_REL}. ` +
        "This command must run from inside a PrepKit workspace."
    );
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Core manifest is not valid JSON (${RAW_MANIFEST_REL}): ${error.message}.`
    );
  }
}

// Derive the pack name when a skill path is rooted under packs/<name>/.
// Returns an empty string for .claude/-rooted skills so downstream consumers
// can distinguish "core" vs "pack" entries without reparsing paths.
export function derivePackFromPath(relPath) {
  if (typeof relPath !== "string") return "";
  const match = relPath.match(/^(?:\.prepkit\/)?packs\/([^/]+)\//);
  return match ? match[1] : "";
}

function normalizeSkillEntries(entries, type) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry.id === "string")
    .map((entry) => ({
      id: entry.id,
      type,
      path: typeof entry.path === "string" ? entry.path : "",
      pack: derivePackFromPath(entry.path)
    }));
}

export function listSkills(manifest) {
  const skills = manifest?.capabilities?.skills || {};
  const domain = normalizeSkillEntries(skills.domain, "domain");
  const process = normalizeSkillEntries(skills.process, "process");
  return [...domain, ...process].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function listAgents(manifest) {
  const agents = Array.isArray(manifest?.agents) ? manifest.agents : [];
  return agents
    .filter((agent) => agent && typeof agent.id === "string")
    .map((agent) => ({
      id: agent.id,
      path: typeof agent.path === "string" ? agent.path : "",
      sourcePath: typeof agent.sourcePath === "string" ? agent.sourcePath : "",
      lane: typeof agent.lane === "string" ? agent.lane : ""
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function padRight(text, width) {
  const str = String(text);
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

function widthOf(rows, key) {
  return rows.reduce((max, row) => Math.max(max, String(row[key] || "").length), 0);
}

export function formatSkillsHuman(skills) {
  if (skills.length === 0) {
    return "No skills declared in the resolved manifest.\n";
  }
  const headers = { id: "ID", type: "Type", pack: "Pack", path: "Path" };
  const rows = [headers, ...skills];
  const idWidth = Math.max(headers.id.length, widthOf(rows, "id"));
  const typeWidth = Math.max(headers.type.length, widthOf(rows, "type"));
  const packWidth = Math.max(headers.pack.length, widthOf(rows, "pack"));

  const lines = [
    `${padRight(headers.id, idWidth)}  ${padRight(headers.type, typeWidth)}  ${padRight(headers.pack, packWidth)}  ${headers.path}`,
    `${"-".repeat(idWidth)}  ${"-".repeat(typeWidth)}  ${"-".repeat(packWidth)}  ${"-".repeat(Math.max(4, headers.path.length))}`
  ];
  for (const skill of skills) {
    lines.push(
      `${padRight(skill.id, idWidth)}  ${padRight(skill.type, typeWidth)}  ${padRight(skill.pack || "-", packWidth)}  ${skill.path}`
    );
  }
  lines.push(`\nTotal: ${skills.length} skill${skills.length === 1 ? "" : "s"}`);
  return lines.join("\n") + "\n";
}

export function formatAgentsHuman(agents) {
  if (agents.length === 0) {
    return "No agents declared in the resolved manifest.\n";
  }
  const headers = { id: "ID", lane: "Lane", path: "Path" };
  const rows = [headers, ...agents];
  const idWidth = Math.max(headers.id.length, widthOf(rows, "id"));
  const laneWidth = Math.max(headers.lane.length, widthOf(rows, "lane"));
  const lines = [
    `${padRight(headers.id, idWidth)}  ${padRight(headers.lane, laneWidth)}  ${headers.path}`,
    `${"-".repeat(idWidth)}  ${"-".repeat(laneWidth)}  ${"-".repeat(Math.max(4, headers.path.length))}`
  ];
  for (const agent of agents) {
    lines.push(
      `${padRight(agent.id, idWidth)}  ${padRight(agent.lane || "-", laneWidth)}  ${agent.path}`
    );
  }
  lines.push(`\nTotal: ${agents.length} agent${agents.length === 1 ? "" : "s"}`);
  return lines.join("\n") + "\n";
}

export function formatManifestSummaryHuman(manifest) {
  const name = manifest?.name || "(unknown)";
  const version = manifest?.version || "(unknown)";
  const packs = Array.isArray(manifest?.composition?.selectedPacks)
    ? manifest.composition.selectedPacks
    : [];
  const skills = manifest?.capabilities?.skills || {};
  const domainCount = Array.isArray(skills.domain) ? skills.domain.length : 0;
  const processCount = Array.isArray(skills.process) ? skills.process.length : 0;
  const agentCount = Array.isArray(manifest?.agents) ? manifest.agents.length : 0;

  const lines = [
    `Name: ${name}`,
    `Version: ${version}`,
    `Pack count: ${packs.length}${packs.length > 0 ? ` (${packs.join(", ")})` : ""}`,
    `Skill count: ${domainCount + processCount} (domain: ${domainCount}, process: ${processCount})`,
    `Agent count: ${agentCount}`,
    "",
    "Use --json for full output."
  ];
  return lines.join("\n") + "\n";
}
