import fs from "node:fs";
import path from "node:path";

/**
 * Parse a decisions.md file and extract structured capture suggestions.
 * Each decision entry is a ## heading followed by Decision: and Rationale: lines.
 *
 * @param {string} planDir - Absolute path to the plan directory
 * @returns {Array<{source: string, excerpt: string, suggestedTarget: string}>}
 */
export function extractSuggestedCaptures(planDir) {
  const decisionsPath = path.join(planDir, "decisions.md");
  if (!fs.existsSync(decisionsPath)) {
    return [];
  }

  const content = fs.readFileSync(decisionsPath, "utf8");
  const entries = parseDecisionEntries(content);
  const planName = path.basename(planDir);

  return entries.map((entry) => ({
    source: `${path.join("plans/active", planName, "decisions.md").replace(/\\/g, "/")}`,
    excerpt: `${entry.heading}\n${entry.decision}${entry.rationale ? `\n${entry.rationale}` : ""}`.trim(),
    suggestedTarget: `.prepkit/docs/reference/knowledge/${slugify(entry.heading)}.md`
  }));
}

/**
 * Parse decision entries from markdown content.
 * Expects format: ## YYYY-MM-DD — label\nDecision: ...\nRationale: ...
 */
function parseDecisionEntries(content) {
  const entries = [];
  const lines = content.split("\n");
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^## \d{4}-\d{2}-\d{2}\s*[—–-]\s*(.+)/);
    if (headingMatch) {
      if (current && current.decision) {
        entries.push(current);
      }
      current = { heading: line.trim(), label: headingMatch[1].trim(), decision: "", rationale: "" };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("Decision:")) {
      current.decision = line.trim();
    } else if (line.startsWith("Rationale:")) {
      current.rationale = line.trim();
    } else if (current.decision && !line.startsWith("Alternatives:") && line.trim() !== "") {
      // Append continuation lines to the last field being read
      if (current.rationale) {
        current.rationale += " " + line.trim();
      } else if (current.decision) {
        current.decision += " " + line.trim();
      }
    }
  }

  if (current && current.decision) {
    entries.push(current);
  }

  return entries;
}

function slugify(heading) {
  return heading
    .replace(/^## \d{4}-\d{2}-\d{2}\s*[—–-]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
