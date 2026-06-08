"use strict";

const ANSI = {
  reset: "\u001b[0m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m"
};

function supportsColor() {
  if (Object.prototype.hasOwnProperty.call(process.env, "NO_COLOR")) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(process.env, "FORCE_COLOR")) {
    return true;
  }
  return true;
}

function paint(text, color) {
  const value = String(text ?? "");
  if (!supportsColor() || !color || !ANSI[color]) {
    return value;
  }
  return `${ANSI[color]}${value}${ANSI.reset}`;
}

function resolveColor(color) {
  return (text) => paint(text, color);
}

function coloredBar(percent, width = 8) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  const tone = clamped >= 75 ? "red" : clamped >= 65 ? "yellow" : "green";
  const full = filled > 0 ? paint("▰".repeat(filled), tone) : "";
  const rest = empty > 0 ? paint("▱".repeat(empty), "gray") : "";
  return `${full}${rest}`;
}

module.exports = {
  coloredBar,
  paint,
  resolveColor
};
