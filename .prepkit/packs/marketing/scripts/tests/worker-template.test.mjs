// worker-template.test.mjs — regression suite for the published-site Worker template
// (publish-repo-template/worker-index.js.tmpl): the form backend at POST /api/lead.
//
// The template contains no __TOKEN__ substitutions by design, so the suite copies it to a temp
// .mjs and imports it directly — what we test is byte-identical to what gets seeded. Fully
// offline: `fetch` is stubbed; `Request`/`Response`/`FormData` come from Node ≥18 globals.
//
// Run: node --test .prepkit/packs/marketing/scripts/tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMPL = path.join(
  __dirname,
  "../../skills/domain/marketing-publish/publish-repo-template/worker-index.js.tmpl"
);

let tmpDir;
let worker;
const realFetch = globalThis.fetch;
let fetchCalls; // recorded [{ url, init }]
let fetchPlan; // url-substring → responder(url, init) → Response

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-tmpl-test-"));
  const dest = path.join(tmpDir, "worker.mjs");
  fs.copyFileSync(TMPL, dest);
  worker = (await import(pathToFileURL(dest).href)).default;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    fetchCalls.push({ url: u, init });
    for (const [needle, responder] of fetchPlan) {
      if (u.includes(needle)) return responder(u, init);
    }
    throw new Error(`unplanned fetch in test: ${u}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const FORWARD_URL = "https://automation.test/webhook/lead";
const okForward = () =>
  new Response(JSON.stringify({ status: "success" }), { status: 200 });

function mkEnv(overrides = {}) {
  return {
    ASSETS: {
      fetch: async () => new Response("static-ok", { status: 200 }),
    },
    FORWARD_WEBHOOK_URL: FORWARD_URL,
    ...overrides,
  };
}

function resetFetch(plan = [["automation.test", okForward]]) {
  fetchCalls = [];
  fetchPlan = plan;
}

function post(body, { headers = {}, env = mkEnv(), path: p = "/api/lead" } = {}) {
  const req = new Request(`https://lp.test${p}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return worker.fetch(req, env);
}

const validLead = (extra = {}) => ({
  event: "lead",
  event_id: "lead_1717891200000_a1b2c3d4",
  fullname: "Nguyễn Văn A",
  email: "hocvien@example.com",
  phone: "0912345678",
  utm_source: "test",
  ...extra,
});

const forwardedBody = () => JSON.parse(fetchCalls[0].init.body);

// ---- routing ----------------------------------------------------------------

test("non-/api paths are served by ASSETS, untouched", async () => {
  resetFetch();
  const req = new Request("https://lp.test/vi/ielts-camp/");
  const res = await worker.fetch(req, mkEnv());
  assert.equal(await res.text(), "static-ok");
  assert.equal(fetchCalls.length, 0);
});

test("GET /api/lead → 405", async () => {
  resetFetch();
  const res = await worker.fetch(new Request("https://lp.test/api/lead"), mkEnv());
  assert.equal(res.status, 405);
});

// ---- payload guards ----------------------------------------------------------

test("oversized body → 413, nothing forwarded", async () => {
  resetFetch();
  const res = await post("x".repeat(20 * 1024 + 1));
  assert.equal(res.status, 413);
  assert.equal(fetchCalls.length, 0);
});

test("malformed JSON → 400", async () => {
  resetFetch();
  const res = await post("{not json");
  assert.equal(res.status, 400);
});

test("honeypot (#website filled) → 200 success, silently dropped", async () => {
  resetFetch();
  const res = await post(validLead({ website: "spam.example" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "success" });
  assert.equal(fetchCalls.length, 0); // bot never reaches the automation
});

test("unknown event → 400", async () => {
  resetFetch();
  const res = await post({ event: "mystery" });
  assert.equal(res.status, 400);
});

// ---- lead validation ----------------------------------------------------------

test("hand-crafted event_id → 400", async () => {
  resetFetch();
  const res = await post(validLead({ event_id: "lead_123_zz" }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, "bad event_id");
});

test("bad email → 400; bad phone → 400", async () => {
  resetFetch();
  assert.equal((await post(validLead({ email: "not-an-email" }))).status, 400);
  assert.equal((await post(validLead({ phone: "12345" }))).status, 400);
  assert.equal(fetchCalls.length, 0);
});

// ---- forwarding ----------------------------------------------------------------

test("valid lead → forwarded once; edge IP overrides client value; secret header sent", async () => {
  resetFetch();
  const env = mkEnv({ FORWARD_SHARED_SECRET: "shared-secret-value" });
  const res = await post(validLead({ client_ip_address: "6.6.6.6" }), {
    headers: { "CF-Connecting-IP": "1.2.3.4" },
    env,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "success" });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, FORWARD_URL);
  assert.equal(fetchCalls[0].init.headers["X-Webhook-Secret"], "shared-secret-value");
  const fwd = forwardedBody();
  assert.equal(fwd.client_ip_address, "1.2.3.4"); // CF header wins over spoofable field
  assert.equal(fwd.utm_source, "test"); // UTM passes through intact
});

test("no FORWARD_SHARED_SECRET → no secret header", async () => {
  resetFetch();
  const res = await post(validLead());
  assert.equal(res.status, 200);
  assert.equal("X-Webhook-Secret" in fetchCalls[0].init.headers, false);
});

test("FORWARD_WEBHOOK_URL unset → 503 'not configured', nothing lost to a wrong URL", async () => {
  resetFetch();
  const res = await post(validLead(), { env: mkEnv({ FORWARD_WEBHOOK_URL: undefined }) });
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /not configured/);
  assert.equal(fetchCalls.length, 0);
});

test("automation's own status is relayed verbatim", async () => {
  resetFetch([[
    "automation.test",
    () => new Response(JSON.stringify({ status: "duplicate" }), { status: 200 }),
  ]]);
  const res = await post(validLead());
  assert.deepEqual(await res.json(), { status: "duplicate" });
});

test("automation non-JSON 500 → 502 error to the page", async () => {
  resetFetch([["automation.test", () => new Response("boom", { status: 500 })]]);
  const res = await post(validLead());
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { status: "error" });
});

test("forward fetch throws → 502 'forward failed' (page can retry)", async () => {
  resetFetch([[
    "automation.test",
    () => { throw new Error("network down"); },
  ]]);
  const res = await post(validLead());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).message, "forward failed");
});

// ---- Turnstile -------------------------------------------------------------------

test("TURNSTILE_SECRET set + no token → 403, no siteverify call", async () => {
  resetFetch();
  const res = await post(validLead(), { env: mkEnv({ TURNSTILE_SECRET: "ts" }) });
  assert.equal(res.status, 403);
  assert.equal(fetchCalls.length, 0);
});

test("TURNSTILE_SECRET set + failing token → 403", async () => {
  resetFetch([[
    "challenges.cloudflare.com",
    () => new Response(JSON.stringify({ success: false }), { status: 200 }),
  ]]);
  const res = await post(validLead({ "cf-turnstile-response": "bad-token" }), {
    env: mkEnv({ TURNSTILE_SECRET: "ts" }),
  });
  assert.equal(res.status, 403);
});

test("TURNSTILE_SECRET set + valid token → verified then forwarded WITHOUT the token", async () => {
  resetFetch([
    ["challenges.cloudflare.com", () => new Response(JSON.stringify({ success: true }), { status: 200 })],
    ["automation.test", okForward],
  ]);
  const res = await post(validLead({ "cf-turnstile-response": "good-token" }), {
    env: mkEnv({ TURNSTILE_SECRET: "ts" }),
  });
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 2); // siteverify + forward
  const fwd = JSON.parse(fetchCalls[1].init.body);
  assert.equal("cf-turnstile-response" in fwd, false); // captcha token never forwarded
});

// ---- check_pay ---------------------------------------------------------------------

test("check_pay with malformed phone/code → neutral 'pending', not forwarded (no open relay)", async () => {
  resetFetch();
  const res = await post({ event: "check_pay", phone: "0912345678", code: "short" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "pending" });
  assert.equal(fetchCalls.length, 0);
});

test("check_pay with well-formed pair → forwarded", async () => {
  resetFetch([[
    "automation.test",
    () => new Response(JSON.stringify({ status: "paid" }), { status: 200 }),
  ]]);
  const res = await post({
    event: "check_pay",
    phone: "0912345678",
    code: "a".repeat(32),
  });
  assert.deepEqual(await res.json(), { status: "paid" });
  assert.equal(fetchCalls.length, 1);
});
