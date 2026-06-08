#!/usr/bin/env node

// PrepKit Console — local web dashboard for non-technical users.
// Zero npm dependencies. Serves single HTML file + API endpoints.
// Usage: node .prepkit/scripts/console.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, exec } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  loadManifest,
  readKitState,
  resolveKitRoot,
  resolvePlanContext
} = require("../../.claude/hooks/lib/runtime.cjs");

// --- State ---
const kitRoot = resolveKitRoot();
const processes = new Map(); // processId -> { child, status, output }
let processCounter = 0;
let commandQueue = []; // serial queue
let isExecuting = false;

// Cache HTML at startup
const htmlPath = path.join(__dirname, "ui", "console.html");
const htmlContent = fs.readFileSync(htmlPath, "utf8");

// --- Security: Host + Origin validation ---
function isLocalHost(req) {
  const host = (req.headers.host || "").split(":")[0];
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function isValidOrigin(req) {
  // GET requests are safe (no side effects for read-only endpoints)
  if (req.method === "GET") return true;
  // POST/mutating requests must have matching Origin or no Origin (same-origin)
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin requests omit Origin
  const host = req.headers.host || "";
  return origin === `http://${host}` || origin === `http://127.0.0.1:${host.split(":")[1] || "3141"}`;
}

// Command allowlist from manifest
function getCommandIds() {
  const { manifest } = loadManifest(kitRoot);
  return new Set((manifest.commands || []).map(c => c.id));
}

// --- API: manifest ---
function getManifestData() {
  const { manifest } = loadManifest(kitRoot);
  const activeManifestPath = path.join(kitRoot, ".prepkit", "active.manifest.json");
  let packs = [];
  try {
    const active = JSON.parse(fs.readFileSync(activeManifestPath, "utf8"));
    packs = active.composition?.selectedPacks || [];
  } catch { /* no active manifest */ }

  return {
    version: manifest.version || "unknown",
    packs,
    commands: (manifest.commands || []).map(cmd => {
      // Read description from command file frontmatter
      let description = "";
      try {
        const cmdPath = path.join(kitRoot, cmd.path);
        const content = fs.readFileSync(cmdPath, "utf8");
        const match = /^description:\s*(.+)$/m.exec(content);
        if (match) description = match[1].trim();
      } catch { /* skip */ }

      return {
        id: cmd.id,
        tier: cmd.tier || "secondary",
        description,
        nextSteps: cmd.nextSteps || [],
        needsArgs: ["plan", "change", "implement"].includes(cmd.id)
      };
    })
  };
}

// --- API: status ---
function getStatusData() {
  const state = readKitState(kitRoot);
  const { manifest } = loadManifest(kitRoot);

  let plan = "", planMode = "", planStatus = "", taskProgress = "", suggestion = "";
  try {
    const planContext = resolvePlanContext({ sessionId: "", manifest, cwd: kitRoot, branch: "" });
    plan = planContext.activePlan ? path.basename(planContext.activePlan) : "";
    planMode = planContext.planMode || "";
    planStatus = planContext.planStatus || "";
  } catch { /* no plan context */ }

  // Derive suggestion
  if (!plan) {
    suggestion = "Run /prep-plan to create your first plan, or /prep-quickstart for guided setup.";
  } else if (planStatus === "active") {
    suggestion = "Continue with /prep-implement or check /prep-next-step.";
  }

  return {
    plan,
    planMode,
    planStatus,
    taskProgress,
    lastBuild: state?.lastBuild ? new Date(state.lastBuild).toLocaleString() : "",
    lastValidate: state?.lastValidate ? new Date(state.lastValidate).toLocaleString() : "",
    suggestion,
    expertMode: state?.expertMode || false,
    commandsUsed: state?.commandsUsed || []
  };
}

// --- API: plan files ---
function getPlanFiles() {
  const { manifest } = loadManifest(kitRoot);
  const activePlansDir = path.join(kitRoot, manifest.paths?.activePlans || "plans/active");
  if (!fs.existsSync(activePlansDir)) return { plans: [] };

  const plans = [];
  try {
    for (const entry of fs.readdirSync(activePlansDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const planDir = path.join(activePlansDir, entry.name);
      const files = [];
      function walk(dir, prefix) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          if (f.name.startsWith(".")) continue;
          const rel = prefix ? `${prefix}/${f.name}` : f.name;
          if (f.isDirectory()) walk(path.join(dir, f.name), rel);
          else if (f.name.endsWith(".md")) files.push(rel);
        }
      }
      walk(planDir, "");
      plans.push({ name: entry.name, files });
    }
  } catch { /* ignore read errors */ }
  return { plans };
}

function getPlanFileContent(planName, filePath) {
  // Sanitize: no path traversal
  if (planName.includes("..") || filePath.includes("..")) return null;
  const { manifest } = loadManifest(kitRoot);
  const plansRoot = path.resolve(kitRoot, manifest.paths?.activePlans || "plans/active");
  const fullPath = path.resolve(plansRoot, planName, filePath);
  // Verify resolved path is still under plans root (blocks symlink escapes)
  if (!fullPath.startsWith(plansRoot + path.sep)) return null;
  if (!fs.existsSync(fullPath)) return null;
  try {
    // Size limit: 512KB max to prevent memory issues
    const stats = fs.statSync(fullPath);
    if (stats.size > 512 * 1024) return "[File too large to preview]";
    return fs.readFileSync(fullPath, "utf8");
  } catch { return null; }
}

// --- API: claude check ---
function checkClaude() {
  try {
    const { execSync } = require("child_process");
    execSync("claude --version", { stdio: "pipe", timeout: 3000 });
    return { available: true };
  } catch {
    return { available: false, error: "Claude CLI not found on PATH. Install from https://claude.ai/code" };
  }
}

// --- Command execution (serial queue) ---
function enqueueCommand(cmdId, args) {
  const processId = String(++processCounter);
  const entry = { processId, cmdId, args, status: "pending", output: [], sseClients: [] };
  processes.set(processId, entry);
  commandQueue.push(processId);
  drainQueue();
  return processId;
}

function drainQueue() {
  if (isExecuting || commandQueue.length === 0) return;
  isExecuting = true;
  const pid = commandQueue.shift();
  const entry = processes.get(pid);
  if (!entry) { isExecuting = false; drainQueue(); return; }

  entry.status = "running";
  const prompt = entry.args ? `/${entry.cmdId} ${entry.args}` : `/${entry.cmdId}`;
  const child = spawn("claude", ["-p", prompt, "--no-input"], {
    cwd: kitRoot,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"]
  });

  entry.child = child;

  // Handle spawn failure (e.g., claude not found)
  // Set flag to prevent close handler from double-draining
  let spawnFailed = false;
  child.on("error", err => {
    spawnFailed = true;
    entry.status = "failed";
    entry.exitCode = 1;
    const msg = `Spawn error: ${err.message}`;
    entry.output.push({ type: "stderr", text: msg });
    for (const res of entry.sseClients) {
      res.write(`event: stderr\ndata: ${msg}\n\n`);
      res.write(`event: status\ndata: ${JSON.stringify({ code: 1, status: "failed", error: msg })}\n\n`);
      res.end();
    }
    entry.sseClients = [];
    isExecuting = false;
    drainQueue();
  });

  child.stdout.on("data", chunk => {
    const text = chunk.toString();
    entry.output.push({ type: "stdout", text });
    for (const res of entry.sseClients) {
      res.write(`event: stdout\ndata: ${text.replace(/\n/g, "\ndata: ")}\n\n`);
    }
  });

  child.stderr.on("data", chunk => {
    const text = chunk.toString();
    entry.output.push({ type: "stderr", text });
    for (const res of entry.sseClients) {
      res.write(`event: stderr\ndata: ${text.replace(/\n/g, "\ndata: ")}\n\n`);
    }
  });

  // Track exit code but wait for streams to close before notifying SSE clients
  let exitCode = null;
  let exitSignal = null;

  child.on("exit", (code, signal) => {
    exitCode = code;
    exitSignal = signal;
  });

  // Use 'close' to ensure all stdio streams are drained before completing
  // Skip if spawn error already handled (prevents double-drain race)
  child.on("close", (code, signal) => {
    if (spawnFailed) return;
    const finalCode = exitCode ?? code;
    const finalSignal = exitSignal ?? signal;
    entry.status = finalSignal === "SIGTERM" ? "canceled" : (finalCode === 0 ? "completed" : "failed");
    entry.exitCode = finalCode;
    for (const res of entry.sseClients) {
      res.write(`event: status\ndata: ${JSON.stringify({ code: finalCode, signal: finalSignal, status: entry.status })}\n\n`);
      res.end();
    }
    entry.sseClients = [];
    isExecuting = false;
    // Clean up old processes after 30min
    setTimeout(() => processes.delete(pid), 30 * 60 * 1000);
    drainQueue();
  });
}

// --- Router ---
function router(req, res) {
  if (!isLocalHost(req)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden: non-localhost access");
    return;
  }
  if (!isValidOrigin(req)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden: cross-origin request");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET / — serve dashboard HTML
  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlContent);
    return;
  }

  // GET /api/manifest
  if (req.method === "GET" && pathname === "/api/manifest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getManifestData()));
    return;
  }

  // GET /api/status
  if (req.method === "GET" && pathname === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getStatusData()));
    return;
  }

  // GET /api/plans — list active plans and their files
  if (req.method === "GET" && pathname === "/api/plans") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getPlanFiles()));
    return;
  }

  // GET /api/plans/:name/:path — read plan file content
  const planMatch = pathname.match(/^\/api\/plans\/([^/]+)\/(.+)$/);
  if (req.method === "GET" && planMatch) {
    const content = getPlanFileContent(planMatch[1], planMatch[2]);
    if (content === null) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("File not found");
    } else {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(content);
    }
    return;
  }

  // GET /api/check-claude — verify Claude CLI is available
  if (req.method === "GET" && pathname === "/api/check-claude") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(checkClaude()));
    return;
  }

  // POST /api/execute — spawn claude command
  if (req.method === "POST" && pathname === "/api/execute") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const { command, args } = JSON.parse(body);
        // Allowlist: only manifest-declared commands
        const allowed = getCommandIds();
        if (!allowed.has(command)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown command: ${command}` }));
          return;
        }
        const processId = enqueueCommand(command, args || "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ processId }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/stream/:id — SSE endpoint
  const streamMatch = pathname.match(/^\/api\/stream\/(\d+)$/);
  if (req.method === "GET" && streamMatch) {
    const entry = processes.get(streamMatch[1]);
    if (!entry) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Process not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    // Send buffered output with original event types
    for (const chunk of entry.output) {
      const type = chunk.type || "stdout";
      const text = chunk.text || chunk;
      res.write(`event: ${type}\ndata: ${String(text).replace(/\n/g, "\ndata: ")}\n\n`);
    }
    // If already done, send status and close
    if (entry.status !== "running" && entry.status !== "pending") {
      res.write(`event: status\ndata: ${JSON.stringify({ code: entry.exitCode, status: entry.status })}\n\n`);
      res.end();
      return;
    }
    entry.sseClients.push(res);
    req.on("close", () => {
      entry.sseClients = entry.sseClients.filter(c => c !== res);
    });
    return;
  }

  // POST /api/cancel/:id
  const cancelMatch = pathname.match(/^\/api\/cancel\/(\d+)$/);
  if (req.method === "POST" && cancelMatch) {
    const entry = processes.get(cancelMatch[1]);
    if (entry?.child && entry.status === "running") {
      entry.child.kill("SIGTERM");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ canceled: true }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ canceled: false }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

// --- Server startup ---
function findPort(startPort, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryPort(port) {
      const server = http.createServer(router);
      server.on("error", err => {
        if (err.code === "EADDRINUSE" && attempt < maxRetries) {
          attempt++;
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => resolve({ server, port }));
    }
    tryPort(startPort);
  });
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`, () => { /* ignore errors */ });
}

async function main() {
  try {
    const { server, port } = await findPort(3141);
    const url = `http://127.0.0.1:${port}`;
    console.log(`PrepKit Console running at ${url}`);
    console.log("Press Ctrl+C to stop.");
    openBrowser(url);

    // Graceful shutdown
    const shutdown = () => {
      console.log("\nShutting down...");
      for (const [, entry] of processes) {
        if (entry.child && entry.status === "running") {
          entry.child.kill("SIGTERM");
        }
      }
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 3000);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

main();
