"use strict";

const { DEFAULT_LAYOUTS, renderSection } = require("./statusline-section-registry.cjs");
const { buildLine } = require("./statusline-string-utils.cjs");

function renderLayout(ctx, layout) {
  return layout
    .map((sectionIds) => buildLine(sectionIds.map((id) => renderSection(id, ctx))))
    .filter(Boolean);
}

function renderStatusline(ctx, mode = "full") {
  if (mode === "none") {
    return [];
  }

  if (mode === "minimal") {
    return renderLayout(ctx, DEFAULT_LAYOUTS.minimal);
  }

  if (mode === "compact") {
    return renderLayout(ctx, DEFAULT_LAYOUTS.compact);
  }

  return renderLayout(ctx, DEFAULT_LAYOUTS.full);
}

module.exports = {
  renderStatusline
};
