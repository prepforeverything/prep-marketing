function countFailures(result) {
  return (
    (result.pageErrors || []).length
    + (result.requestFailures || []).length
    + (result.responseFailures || []).length
  );
}

function renderList(title, items, formatter = (item) => String(item)) {
  const lines = [`## ${title}`, ""];
  if (!items || items.length === 0) {
    lines.push("- none", "");
    return lines;
  }

  for (const item of items) {
    lines.push(`- ${formatter(item)}`);
  }
  lines.push("");
  return lines;
}

export function renderMarkdownReport({ spec, result, specPath }) {
  const status = result.success ? "pass" : "fail";
  const lines = [
    "# Browser QA Report",
    "",
    `- Status: ${status}`,
    `- Spec: \`${specPath}\``,
    `- Browser: \`${result.browser || spec.browser}\``,
    `- Final URL: \`${result.finalUrl || "n/a"}\``,
    `- Artifacts: \`${result.artifactsDir || spec.artifactsDir}\``,
    `- Started: ${result.startedAt || "n/a"}`,
    `- Ended: ${result.endedAt || "n/a"}`,
    ""
  ];

  if (!result.success) {
    lines.push("## Failure", "", `- ${result.error}`, "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Summary", "");
  lines.push(`- Actions run: ${(result.actionLog || []).length}`);
  lines.push(`- Screenshots: ${(result.screenshots || []).length}`);
  lines.push(`- Observed failures: ${countFailures(result)}`);
  lines.push("");

  lines.push(...renderList("Action Log", result.actionLog || [], (entry) => {
    const details = [];
    if (entry.url) {
      details.push(`url=\`${entry.url}\``);
    }
    if (entry.selector) {
      details.push(`selector=\`${entry.selector}\``);
    }
    if (entry.path) {
      details.push(`path=\`${entry.path}\``);
    }
    return `step ${entry.index}: \`${entry.type}\` (${entry.status})${details.length ? ` ${details.join(" ")}` : ""}`;
  }));

  lines.push(...renderList("Screenshots", result.screenshots || [], (entry) => `step ${entry.step}: \`${entry.path}\``));
  lines.push(...renderList("Console Messages", result.consoleMessages || [], (entry) => `\`${entry.type}\` ${entry.text}`));
  lines.push(...renderList("Page Errors", result.pageErrors || [], (entry) => entry.message));
  lines.push(...renderList("Request Failures", result.requestFailures || [], (entry) => `\`${entry.method}\` ${entry.url} (${entry.failure})`));
  lines.push(...renderList("Response Failures", result.responseFailures || [], (entry) => `\`${entry.method}\` ${entry.url} (${entry.status} ${entry.statusText})`));

  return `${lines.join("\n")}\n`;
}
