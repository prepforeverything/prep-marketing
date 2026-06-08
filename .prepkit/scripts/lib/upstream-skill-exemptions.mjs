// Upstream-sourced skills are imported bit-for-bit from external repos and
// must remain in sync with upstream. They are exempt from PrepKit-specific
// authoring conventions (## Gotchas section, 500-line skill budget,
// cross-skill reference flagging) so clean syncs stay friction-free.
//
// When adding a new upstream-sourced skill set, extend this set and add a
// source comment. All PrepKit validators and tests read this constant — do
// not duplicate the list elsewhere.

// github.com/figma/mcp-server-guide
export const UPSTREAM_EXEMPT_SKILL_IDS = new Set([
  "figma-use",
  "figma-implement-design",
  "figma-generate-design",
  "figma-generate-library",
  "figma-code-connect",
  "figma-create-design-system-rules",
  "figma-create-new-file"
]);

export function isUpstreamExemptById(skillId) {
  return UPSTREAM_EXEMPT_SKILL_IDS.has(skillId);
}

export function isUpstreamExemptByPath(skillPath) {
  if (!skillPath) return false;
  for (const id of UPSTREAM_EXEMPT_SKILL_IDS) {
    if (skillPath.includes(`/${id}/`) || skillPath.endsWith(`/${id}`)) {
      return true;
    }
  }
  return false;
}
