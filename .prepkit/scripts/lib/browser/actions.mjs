import path from "node:path";
import { ensureDir } from "./fs-utils.mjs";

function resolveUrl(baseUrl, target) {
  if (!baseUrl || /^https?:\/\//.test(target)) {
    return target;
  }

  return new URL(target, baseUrl).toString();
}

async function assertText(page, action) {
  const text = (await page.locator(action.selector).textContent()) || "";
  if (action.match === "contains") {
    if (!text.includes(action.value)) {
      throw new Error(`Expected ${action.selector} to contain "${action.value}", got "${text}"`);
    }
    return;
  }

  if (text.trim() !== action.value) {
    throw new Error(`Expected ${action.selector} to equal "${action.value}", got "${text.trim()}"`);
  }
}

export async function executeActions({ page, actions, artifactsDir, baseUrl }) {
  const actionLog = [];
  const screenshots = [];

  for (const [index, action] of actions.entries()) {
    const startedAt = new Date().toISOString();
    const entry = {
      index: index + 1,
      type: action.type,
      startedAt,
      status: "ok"
    };

    try {
      switch (action.type) {
        case "goto":
          entry.url = resolveUrl(baseUrl, action.url);
          await page.goto(entry.url, { waitUntil: action.waitUntil || "networkidle", timeout: action.timeoutMs });
          break;
        case "click":
          entry.selector = action.selector;
          await page.click(action.selector, { timeout: action.timeoutMs });
          break;
        case "fill":
          entry.selector = action.selector;
          await page.fill(action.selector, action.value, { timeout: action.timeoutMs });
          break;
        case "press":
          entry.selector = action.selector;
          await page.press(action.selector, action.key, { timeout: action.timeoutMs });
          break;
        case "check":
          entry.selector = action.selector;
          await page.check(action.selector, { timeout: action.timeoutMs });
          break;
        case "uncheck":
          entry.selector = action.selector;
          await page.uncheck(action.selector, { timeout: action.timeoutMs });
          break;
        case "selectOption":
          entry.selector = action.selector;
          await page.selectOption(action.selector, action.value, { timeout: action.timeoutMs });
          break;
        case "waitForSelector":
          entry.selector = action.selector;
          await page.waitForSelector(action.selector, { state: action.state || "visible", timeout: action.timeoutMs });
          break;
        case "waitForURL":
          entry.url = resolveUrl(baseUrl, action.url);
          await page.waitForURL(entry.url, { timeout: action.timeoutMs });
          break;
        case "assertVisible":
          entry.selector = action.selector;
          await page.locator(action.selector).waitFor({ state: "visible", timeout: action.timeoutMs });
          break;
        case "assertText":
          entry.selector = action.selector;
          await assertText(page, action);
          break;
        case "sleep":
          entry.durationMs = action.durationMs || 1000;
          await page.waitForTimeout(entry.durationMs);
          break;
        case "screenshot": {
          const screenshotPath = action.path || path.join(artifactsDir, `step-${index + 1}.png`);
          ensureDir(path.dirname(screenshotPath));
          await page.screenshot({ path: screenshotPath, fullPage: action.fullPage !== false });
          entry.path = screenshotPath;
          screenshots.push({ path: screenshotPath, step: index + 1 });
          break;
        }
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error.message;
      entry.endedAt = new Date().toISOString();
      actionLog.push(entry);
      error.actionLog = [...actionLog];
      error.screenshots = [...screenshots];
      throw error;
    }

    entry.endedAt = new Date().toISOString();
    actionLog.push(entry);
  }

  return { actionLog, screenshots };
}
