const fs = require("node:fs");
const path = require("node:path");
const { normalizeSlug, normalizeSelectedPackToken } = require("./skill-stack-taxonomy.cjs");

const SKILL_CATEGORIES = ["domain", "process"];
const PACK_PATH_PREFIXES = [".prepkit/packs/", "packs/"];
const SKILL_ID_STACK_HINTS = [
  ["nodejs", /\b(nodejs|express|nestjs)\b/],
  ["python", /\b(python|django|fastapi)\b/],
  ["go", /\b(golang)\b|^backend-go\b|\b(gin|fiber|grpc)\b/],
  ["rust", /\b(rust|axum|actix)\b/],
  ["java", /\b(java|spring|quarkus)\b/],
  ["php", /\b(php|laravel)\b/],
  ["flutter", /\bflutter\b/],
  ["frontend", /\b(frontend|react|nextjs|vue|nuxt|web)\b/],
  ["figma", /\bfigma\b/],
  ["postgresql", /\b(postgresql|postgres|psql)\b/],
  ["mongodb", /\b(mongodb|mongo)\b/],
  ["mysql", /\bmysql\b/],
  ["redis", /\bredis\b/],
  ["clickhouse", /\bclickhouse\b/],
  ["dynamodb", /\b(dynamodb|dynamo)\b/],
  ["elasticsearch", /\b(elasticsearch|opensearch)\b/],
  ["tidb", /\btidb\b/]
];

function resolvePackDir(kitRoot, packName) {
  const candidates = [
    path.join(kitRoot, ".prepkit", "packs", packName),
    path.join(kitRoot, "packs", packName)
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "pack.manifest.json"))) || candidates[0];
}

function readPackManifest(kitRoot, packName) {
  const packDir = resolvePackDir(kitRoot, packName);
  const manifestPath = path.join(packDir, "pack.manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return {
      manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
      packDir
    };
  } catch (error) {
    throw new Error(`Failed to parse ${manifestPath}: ${error.message}`);
  }
}

function isPackSkill(skill) {
  if (typeof skill?.path !== "string") return false;
  const normalizedPath = skill.path.replace(/\\/g, "/");
  return PACK_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

function inferPackNameFromPath(skillPath) {
  const normalizedPath = typeof skillPath === "string" ? skillPath.replace(/\\/g, "/") : "";
  for (const prefix of PACK_PATH_PREFIXES) {
    if (!normalizedPath.startsWith(prefix)) continue;
    const [packName = ""] = normalizedPath.slice(prefix.length).split("/");
    return packName || "";
  }
  return "";
}

function effectiveStacks(skill, packName = "") {
  if (skill?.alwaysAvailable === true) return [];
  if (Array.isArray(skill?.stacks) && skill.stacks.length > 0) {
    return Array.from(new Set(skill.stacks.map(normalizeSlug).filter(Boolean))).sort();
  }

  const inferred = new Set();
  const id = String(skill?.id || "").toLowerCase();
  if (id === "backend-core" || id === "backend-facilitation") {
    for (const slug of ["go", "java", "nodejs", "php", "python", "rust"]) {
      inferred.add(slug);
    }
  }
  for (const [slug, pattern] of SKILL_ID_STACK_HINTS) {
    if (pattern.test(id)) inferred.add(slug);
  }

  const packSlug = normalizeSelectedPackToken(packName);
  if (packSlug && (inferred.size === 0 || skill?.tier === "router")) {
    inferred.add(packSlug);
  }
  return Array.from(inferred).sort();
}

function shouldInclude(skill, activeStacksResult, packName = "") {
  if (skill.alwaysAvailable === true) return true;
  if (activeStacksResult.mode === "all") return true;
  const active = new Set(activeStacksResult.stacks);
  return effectiveStacks(skill, packName).some((slug) => active.has(slug));
}

function resolveExpectedRuntimeSkills({ manifest, activeStacksResult, kitRoot } = {}) {
  const result = new Map();
  const selectedPacks = manifest?.composition?.selectedPacks;
  if (!Array.isArray(selectedPacks) || selectedPacks.length === 0) return result;
  if (!activeStacksResult || typeof activeStacksResult.mode !== "string") {
    throw new Error("resolveExpectedRuntimeSkills: activeStacksResult { mode, stacks } is required");
  }

  for (const packName of selectedPacks) {
    const pack = readPackManifest(kitRoot, packName);
    if (!pack) continue;

    for (const category of SKILL_CATEGORIES) {
      const entries = pack.manifest?.capabilities?.skills?.[category];
      if (!Array.isArray(entries)) continue;

      for (const skill of entries) {
        if (!skill || typeof skill.id !== "string") continue;
        if (!shouldInclude(skill, activeStacksResult, packName)) continue;

        const runtimeLinkPath = path.join(".claude", "skills", category, skill.id);
        const sourceDir = path.join(pack.packDir, "skills", category, skill.id);
        result.set(runtimeLinkPath, {
          sourceDir,
          sourceType: "pack",
          skillId: skill.id,
          category,
          packName
        });
      }
    }
  }

  return result;
}

function resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult } = {}) {
  if (!activeStacksResult || typeof activeStacksResult.mode !== "string") {
    throw new Error("resolveExpectedRuntimeSkillEntries: activeStacksResult { mode, stacks } is required");
  }

  const result = { domain: [], process: [] };
  for (const category of SKILL_CATEGORIES) {
    const entries = manifest?.capabilities?.skills?.[category];
    if (!Array.isArray(entries)) continue;

    for (const skill of entries) {
      if (!skill || typeof skill.id !== "string") continue;
      if (!isPackSkill(skill) || shouldInclude(skill, activeStacksResult, inferPackNameFromPath(skill.path))) {
        result[category].push(skill);
      }
    }
  }

  return result;
}

function countManifestSkills(manifest) {
  return SKILL_CATEGORIES.reduce(
    (total, category) => total + (manifest?.capabilities?.skills?.[category] || []).length,
    0
  );
}

function countRuntimeSkillEntries(entries) {
  return SKILL_CATEGORIES.reduce((total, category) => total + (entries?.[category] || []).length, 0);
}

module.exports = {
  SKILL_CATEGORIES,
  resolveExpectedRuntimeSkills,
  resolveExpectedRuntimeSkillEntries,
  countManifestSkills,
  countRuntimeSkillEntries
};
