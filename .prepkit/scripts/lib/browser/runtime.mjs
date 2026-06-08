import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./fs-utils.mjs";
import { createObservers } from "./observability.mjs";
import { executeActions } from "./actions.mjs";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(`Playwright is not installed. Run "npm install" in the PrepKit repo root first. Original error: ${error.message}`);
  }
}

function browserType(playwright, name) {
  const type = playwright[name];
  if (!type) {
    throw new Error(`Unsupported browser "${name}". Use chromium, firefox, or webkit.`);
  }
  return type;
}

export async function executeBrowserFlow(spec) {
  if (spec.storageStatePath && !fs.existsSync(spec.storageStatePath)) {
    throw new Error(`Missing storage state file: ${spec.storageStatePath}`);
  }

  ensureDir(spec.artifactsDir);

  const playwright = await loadPlaywright();
  const browser = await browserType(playwright, spec.browser).launch({ headless: spec.headless });
  const context = await browser.newContext({
    viewport: spec.viewport,
    storageState: spec.storageStatePath || undefined
  });

  try {
    const page = await context.newPage();
    const observed = createObservers(page, spec.capture);
    const startedAt = new Date().toISOString();

    if (spec.startUrl) {
      await page.goto(spec.baseUrl ? new URL(spec.startUrl, spec.baseUrl).toString() : spec.startUrl, {
        waitUntil: "networkidle"
      });
    }

    let actionLog = [];
    let screenshots = [];
    try {
      const actionResult = await executeActions({
        page,
        actions: spec.actions,
        artifactsDir: spec.artifactsDir,
        baseUrl: spec.baseUrl
      });
      actionLog = actionResult.actionLog;
      screenshots = actionResult.screenshots;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        startedAt,
        endedAt: new Date().toISOString(),
        browser: spec.browser,
        finalUrl: page.url(),
        artifactsDir: spec.artifactsDir,
        storageStatePath: spec.saveStorageStatePath || null,
        actionLog: error.actionLog || [],
        screenshots: error.screenshots || [],
        consoleMessages: observed.consoleMessages,
        pageErrors: observed.pageErrors,
        requestFailures: observed.requestFailures,
        responseFailures: observed.responseFailures
      };
    }

    if (spec.saveStorageStatePath) {
      ensureDir(path.dirname(spec.saveStorageStatePath));
      await context.storageState({ path: spec.saveStorageStatePath });
    }

    return {
      success: true,
      startedAt,
      endedAt: new Date().toISOString(),
      browser: spec.browser,
      finalUrl: page.url(),
      artifactsDir: spec.artifactsDir,
      storageStatePath: spec.saveStorageStatePath || null,
      actionLog,
      screenshots,
      consoleMessages: observed.consoleMessages,
      pageErrors: observed.pageErrors,
      requestFailures: observed.requestFailures,
      responseFailures: observed.responseFailures
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
