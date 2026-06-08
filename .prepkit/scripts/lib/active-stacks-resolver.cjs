const {
  STACK_SLUGS,
  normalizeSlug,
  normalizeSelectedPackToken,
  mapDetectedStack
} = require("./skill-stack-taxonomy.cjs");

function canonicalSlugList() {
  return Array.from(STACK_SLUGS).sort();
}

function rejectUnknown(input, source) {
  const slug = normalizeSlug(input);
  if (slug === null) {
    const known = canonicalSlugList().join(", ");
    throw new Error(
      `Unknown skill stack slug "${input}" in ${source}. Known canonical slugs: ${known}`
    );
  }
  return slug;
}

function dedupeSorted(values) {
  return Array.from(new Set(values)).sort();
}

function parseEnvList(rawValue) {
  return rawValue
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function resolveActiveStacks({ manifest, detected, env } = {}) {
  const envValue = typeof env?.PREPKIT_SKILL_STACKS === "string" ? env.PREPKIT_SKILL_STACKS.trim() : "";

  if (envValue.length > 0) {
    if (envValue.toLowerCase() === "all") {
      return { mode: "all", stacks: [] };
    }
    const tokens = parseEnvList(envValue);
    if (tokens.length > 0) {
      const slugs = tokens.map((token) => rejectUnknown(token, "PREPKIT_SKILL_STACKS"));
      return { mode: "filtered", stacks: dedupeSorted(slugs) };
    }
  }

  const policy = manifest?.runtimePolicy?.skillStackGating;
  if (policy === "all") {
    return { mode: "all", stacks: [] };
  }
  if (Array.isArray(policy)) {
    const slugs = policy.map((token) => rejectUnknown(token, "manifest.runtimePolicy.skillStackGating"));
    return { mode: "filtered", stacks: dedupeSorted(slugs) };
  }

  // Auto-detected stack slugs from detect-context signals.
  const selectedPackSlugs = Array.isArray(manifest?.composition?.selectedPacks)
    ? manifest.composition.selectedPacks.map(normalizeSelectedPackToken).filter(Boolean)
    : [];
  const detectedSlugs = dedupeSorted([
    ...mapDetectedStack(detected?.resolvedProjectStack ?? {}),
    ...selectedPackSlugs
  ]);

  // PREPKIT_ADDITIONAL_SKILL_STACKS is additive: union with detected stacks
  // instead of replacing them. Useful for "I'm Node.js but also touching
  // Postgres" workflows without committing to a manifest policy.
  const additiveValue = typeof env?.PREPKIT_ADDITIONAL_SKILL_STACKS === "string"
    ? env.PREPKIT_ADDITIONAL_SKILL_STACKS.trim()
    : "";
  if (additiveValue.length > 0) {
    const tokens = parseEnvList(additiveValue);
    if (tokens.length > 0) {
      const slugs = tokens.map((token) => rejectUnknown(token, "PREPKIT_ADDITIONAL_SKILL_STACKS"));
      return { mode: "filtered", stacks: dedupeSorted([...detectedSlugs, ...slugs]) };
    }
  }

  return { mode: "filtered", stacks: detectedSlugs };
}

module.exports = {
  resolveActiveStacks
};
