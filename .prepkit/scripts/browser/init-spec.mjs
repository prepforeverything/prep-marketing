#!/usr/bin/env node

import path from "node:path";
import { ensureDir, writeJson } from "../lib/browser/fs-utils.mjs";
import { defaultInitSpecPath, slugify } from "../lib/browser/defaults.mjs";

const HELP = `Usage:
  npm run browser:init-spec -- --title "dashboard smoke" --url /dashboard [--base-url http://localhost:3000] [--selector h1] [--text "Dashboard"] [--path path/to/spec.json]
`;

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }

  return args;
}

function buildSpec(args) {
  const slug = slugify(args.title);
  const actions = [
    {
      type: "goto",
      url: args.url
    }
  ];

  if (args.selector) {
    actions.push({
      type: "waitForSelector",
      selector: args.selector
    });
  }

  if (args.selector && args.text) {
    actions.push({
      type: "assertText",
      selector: args.selector,
      value: args.text
    });
  }

  actions.push({
    type: "screenshot",
    path: null,
    fullPage: true
  });

  return {
    browser: "chromium",
    headless: true,
    baseUrl: args["base-url"] || null,
    capture: {
      console: true,
      network: true,
      pageErrors: true
    },
    meta: {
      title: args.title,
      slug
    },
    actions
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (!args.title || !args.url) {
    throw new Error("init-spec requires --title and --url");
  }

  const targetPath = path.resolve(args.path || defaultInitSpecPath({ cwd: process.cwd(), title: args.title }));
  ensureDir(path.dirname(targetPath));
  writeJson(targetPath, buildSpec(args));
  process.stdout.write(`${targetPath}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
