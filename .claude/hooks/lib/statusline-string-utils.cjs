"use strict";

const os = require("os");
const path = require("path");

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(text) {
  return Array.from(stripAnsi(text)).length;
}

function truncate(text, maxLength = 32) {
  const value = String(text || "").trim();
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function truncateMiddle(text, maxLength = 32) {
  const value = String(text || "").trim();
  if (!value || value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 5) {
    return truncate(value, maxLength);
  }

  const left = Math.floor((maxLength - 3) / 2);
  const right = maxLength - 3 - left;
  return `${value.slice(0, left)}...${value.slice(value.length - right)}`;
}

function shortenPath(targetPath, maxLength = 32) {
  const input = String(targetPath || "");
  if (!input) {
    return "";
  }

  const homeDir = os.homedir();
  const normalized = input.startsWith(homeDir)
    ? `~${input.slice(homeDir.length)}`
    : input;

  if (visibleLength(normalized) <= maxLength) {
    return normalized;
  }

  const baseName = path.basename(normalized) || normalized;
  const parentName = path.basename(path.dirname(normalized));
  const collapsed = parentName && parentName !== "."
    ? `.../${parentName}/${baseName}`
    : `.../${baseName}`;

  if (visibleLength(collapsed) <= maxLength) {
    return collapsed;
  }

  return truncateMiddle(normalized, maxLength);
}

function buildLine(segments) {
  return segments.filter(Boolean).join(" | ");
}

module.exports = {
  buildLine,
  shortenPath,
  stripAnsi,
  truncate,
  truncateMiddle,
  visibleLength
};
