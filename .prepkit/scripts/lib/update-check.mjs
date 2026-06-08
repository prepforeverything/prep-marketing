import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const DEFAULT_REPO = "namht1st/prep-kit";

export function defaultCachePath() {
  return path.join(os.homedir(), ".prepkit-update-check.json");
}

export function downloadJSON(url, { headers = {}, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const mergedHeaders = { "User-Agent": "prepkit-update-check", ...headers };
    const request = https.request(requestUrl, { headers: mergedHeaders }, (response) => {
      const { statusCode = 0, headers: responseHeaders } = response;

      if ([301, 302, 307, 308].includes(statusCode) && responseHeaders.location) {
        if (maxRedirects <= 0) {
          response.resume();
          reject(new Error(`Too many redirects while downloading ${url}`));
          return;
        }
        response.resume();
        const redirectUrl = new URL(responseHeaders.location, requestUrl).toString();
        resolve(downloadJSON(redirectUrl, { headers, maxRedirects: maxRedirects - 1 }));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Request failed with status ${statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try { resolve(JSON.parse(chunks.join(""))); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchLatestVersion({ env = process.env, download = downloadJSON } = {}) {
  const repo = env.PREPKIT_REPO || DEFAULT_REPO;
  const headers = {};
  if (env.GITHUB_TOKEN) headers.Authorization = `token ${env.GITHUB_TOKEN}`;
  const data = await download(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  const version = (data.tag_name || "").replace(/^v/, "");
  return {
    version,
    releaseUrl: data.html_url || "",
    releaseNotes: (data.body || "").slice(0, 500),
  };
}

function compareSemver(a, b) {
  const pa = (a || "0.0.0").split(".").map(Number);
  const pb = (b || "0.0.0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) > (pa[i] || 0)) return 1;
    if ((pb[i] || 0) < (pa[i] || 0)) return -1;
  }
  return 0;
}

export async function checkForUpdate({ currentVersion, env, download } = {}) {
  const { version: latest, releaseUrl, releaseNotes } = await fetchLatestVersion({ env, download });
  const available = compareSemver(currentVersion, latest) > 0;
  return { available, current: currentVersion, latest, releaseUrl, releaseNotes };
}

export function readCachedCheck(cachePath = defaultCachePath()) {
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const cached = JSON.parse(raw);
    if (!cached.checkedAt) return null;
    const age = Date.now() - new Date(cached.checkedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) return null;
    return cached.result ?? null;
  } catch { return null; }
}

export function writeCachedCheck(cachePath = defaultCachePath(), result) {
  const data = JSON.stringify({ checkedAt: new Date().toISOString(), result }, null, 2);
  const tmpPath = cachePath + ".tmp." + process.pid;
  fs.writeFileSync(tmpPath, data, "utf8");
  fs.renameSync(tmpPath, cachePath);
}
