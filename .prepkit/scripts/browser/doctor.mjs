#!/usr/bin/env node

function diagnose(error) {
  const message = error.message || String(error);

  if (message.includes("Cannot find package 'playwright'")) {
    return {
      code: "playwright-missing",
      nextStep: "Run npm install in the PrepKit repo root."
    };
  }

  if (message.includes("Executable doesn't exist")) {
    return {
      code: "browser-missing",
      nextStep: "Run npx playwright install chromium in the PrepKit repo root."
    };
  }

  if (message.includes("bootstrap_check_in") || message.includes("Permission denied (1100)") || message.includes("MachPortRendezvous")) {
    return {
      code: "sandbox-launch-blocked",
      nextStep: "Run browser doctor or browser QA outside the sandbox in this environment."
    };
  }

  return {
    code: "browser-launch-failed",
    nextStep: "Inspect the launch error and browser logs."
  };
}

try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("about:blank");
  await browser.close();

  process.stdout.write(`${JSON.stringify({
    success: true,
    browser: "chromium",
    url: "about:blank",
    checks: {
      playwrightInstalled: true,
      browserInstalled: true,
      browserLaunch: true
    }
  }, null, 2)}\n`);
} catch (error) {
  const diagnosis = diagnose(error);
  process.stderr.write(`${JSON.stringify({
    success: false,
    error: error.message,
    diagnosis
  }, null, 2)}\n`);
  process.exit(1);
}
