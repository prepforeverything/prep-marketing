/**
 * Skill stack schema validation.
 *
 * Each skill entry in `capabilities.skills.{domain,process}` must carry exactly
 * one of:
 *   - `alwaysAvailable: true` (unconditional inclusion), or
 *   - `stacks: [<canonical-slug>, ...]` (non-empty, slugs from STACK_SLUGS).
 *
 * Mutually exclusive at the schema level. Explicit `alwaysAvailable: false` is
 * rejected to keep manifests clean — the field is implicitly false when absent.
 *
 * Core skills (those declared in `kit.manifest.json` and living as real
 * directories under `.claude/skills/`) MUST use `alwaysAvailable: true` — they
 * cannot be physically gated by symlink removal. See
 * plans/active/260428-1423-skill-stack-gating/spec/stack-taxonomy.md
 * § "Constraint: core skills must be alwaysAvailable: true".
 */

import { STACK_SLUGS } from "../skill-stack-taxonomy.mjs";

const TAXONOMY_REF =
  "plans/active/260428-1423-skill-stack-gating/spec/stack-taxonomy.md";

function canonicalSlugList() {
  return Array.from(STACK_SLUGS).sort().join(", ");
}

export function validateSkillStackFields(skill, { isCore = false } = {}) {
  const errors = [];

  if (!skill || typeof skill !== "object" || typeof skill.id !== "string") {
    return { errors };
  }

  const skillId = skill.id;
  const hasAlwaysAvailableField = Object.hasOwn(skill, "alwaysAvailable");
  const hasStacksField = Object.hasOwn(skill, "stacks");

  if (hasAlwaysAvailableField && skill.alwaysAvailable === false) {
    errors.push(
      `Skill ${skillId} must omit alwaysAvailable when not set; explicit false is rejected`
    );
    return { errors };
  }

  if (
    hasAlwaysAvailableField &&
    skill.alwaysAvailable !== true &&
    skill.alwaysAvailable !== false
  ) {
    errors.push(
      `Skill ${skillId} alwaysAvailable must be the literal boolean true (or omitted)`
    );
    return { errors };
  }

  if (skill.alwaysAvailable === true && hasStacksField) {
    errors.push(
      `Skill ${skillId} cannot have both alwaysAvailable: true and stacks fields (mutually exclusive at the schema level)`
    );
    return { errors };
  }

  if (skill.alwaysAvailable === true) {
    return { errors };
  }

  if (isCore) {
    errors.push(
      `Core skill ${skillId} must have alwaysAvailable: true (core skills live in .claude/skills/ as real directories and cannot be physically gated by stack)`
    );
    return { errors };
  }

  if (!Array.isArray(skill.stacks) || skill.stacks.length === 0) {
    errors.push(
      `Skill ${skillId} must declare stacks: [...] (non-empty) or alwaysAvailable: true`
    );
    return { errors };
  }

  for (const slug of skill.stacks) {
    if (typeof slug !== "string") {
      errors.push(
        `Skill ${skillId} stacks contains non-string entry ${JSON.stringify(slug)}; entries must be canonical slug strings`
      );
      continue;
    }
    if (!STACK_SLUGS.has(slug)) {
      errors.push(
        `Skill ${skillId} stacks contains unknown slug "${slug}"; use canonical slug from STACK_SLUGS (known: ${canonicalSlugList()}). Aliases like postgres/mongo/node must be normalized to their canonical form. See ${TAXONOMY_REF}`
      );
    }
  }

  return { errors };
}
