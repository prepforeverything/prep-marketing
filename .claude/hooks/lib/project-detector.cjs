/**
 * Best-effort project type detection from filesystem markers.
 * Returns { type, packageManager, framework }.
 * No network calls. Defaults to { type: "unknown" } on failure.
 */

const fs = require("fs");
const path = require("path");

const FRAMEWORK_DEPS = {
  next: "Next.js",
  nuxt: "Nuxt",
  react: "React",
  vue: "Vue",
  angular: "Angular",
  svelte: "Svelte",
  express: "Express",
  fastify: "Fastify",
  hono: "Hono",
  nestjs: "NestJS"
};

const PYTHON_FRAMEWORKS = {
  django: "Django",
  fastapi: "FastAPI",
  flask: "Flask",
  starlette: "Starlette"
};

const PHP_FRAMEWORKS = {
  laravel: "Laravel"
};

const GO_FRAMEWORKS = {
  "github.com/gin-gonic/gin": "Gin",
  "github.com/gofiber/fiber": "Fiber",
  "google.golang.org/grpc": "gRPC"
};

function detectNode(cwd) {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); } catch { return { type: "node", packageManager: "npm", framework: "" }; }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  let framework = "";
  for (const [dep, label] of Object.entries(FRAMEWORK_DEPS)) {
    if (allDeps[dep] || allDeps[`@${dep}/core`]) {
      framework = label;
      break;
    }
  }

  const pm = fs.existsSync(path.join(cwd, "pnpm-lock.yaml")) ? "pnpm"
    : fs.existsSync(path.join(cwd, "yarn.lock")) ? "yarn"
    : fs.existsSync(path.join(cwd, "bun.lockb")) ? "bun"
    : "npm";

  return { type: "node", packageManager: pm, framework };
}

function detectPython(cwd) {
  const markers = ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"];
  if (!markers.some((m) => fs.existsSync(path.join(cwd, m)))) return null;

  let framework = "";
  for (const file of ["requirements.txt", "pyproject.toml", "setup.py"]) {
    const filePath = path.join(cwd, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf8").toLowerCase();
      for (const [pkg, label] of Object.entries(PYTHON_FRAMEWORKS)) {
        if (content.includes(pkg)) { framework = label; break; }
      }
      if (framework) break;
    } catch { continue; }
  }

  const pm = fs.existsSync(path.join(cwd, "poetry.lock")) ? "poetry"
    : fs.existsSync(path.join(cwd, "Pipfile")) ? "pipenv"
    : fs.existsSync(path.join(cwd, "uv.lock")) ? "uv"
    : "pip";

  return { type: "python", packageManager: pm, framework };
}

function detectPhp(cwd) {
  const composerPath = path.join(cwd, "composer.json");
  if (!fs.existsSync(composerPath)) return null;

  let framework = "";
  try {
    const composer = fs.readFileSync(composerPath, "utf8").toLowerCase();
    for (const [pkg, label] of Object.entries(PHP_FRAMEWORKS)) {
      if (composer.includes(pkg)) {
        framework = label;
        break;
      }
    }
  } catch {
    return { type: "php", packageManager: "composer", framework: "" };
  }

  return { type: "php", packageManager: "composer", framework };
}

function detectFlutter(cwd) {
  const pubspecPath = path.join(cwd, "pubspec.yaml");
  if (!fs.existsSync(pubspecPath)) return null;
  return { type: "dart", packageManager: "flutter pub", framework: "Flutter" };
}

function detectGo(cwd) {
  const modPath = path.join(cwd, "go.mod");
  if (!fs.existsSync(modPath)) return null;

  let framework = "";
  try {
    const content = fs.readFileSync(modPath, "utf8").toLowerCase();
    for (const [moduleName, label] of Object.entries(GO_FRAMEWORKS)) {
      if (content.includes(moduleName)) {
        framework = label;
        break;
      }
    }
  } catch {
    framework = "";
  }

  return { type: "go", packageManager: "go", framework };
}

function inferComponentKind(dirName, project) {
  const normalized = String(dirName || "").toLowerCase();
  if (["backend", "api", "server", "services"].includes(normalized)) return "backend";
  if (["frontend", "web", "client"].includes(normalized)) return "frontend";
  if (["mobile", "app"].includes(normalized)) {
    return project?.framework === "Flutter" ? "mobile" : "frontend";
  }
  if (project?.framework === "Flutter") return "mobile";
  if (["Next.js", "Nuxt", "React", "Vue", "Angular", "Svelte"].includes(project?.framework)) return "frontend";
  if (["go", "java", "php", "python", "rust"].includes(project?.type)) return "backend";
  if (["Express", "Fastify", "Hono", "NestJS", "Django", "FastAPI", "Flask", "Starlette", "Laravel"].includes(project?.framework)) return "backend";
  return "";
}

function detectProjectComponents(cwd) {
  const candidates = ["backend", "api", "server", "services", "frontend", "web", "client", "mobile", "app"];
  const components = [];
  const seen = new Set();

  for (const dirName of candidates) {
    const componentRoot = path.join(cwd, dirName);
    if (seen.has(componentRoot) || !fs.existsSync(componentRoot)) {
      continue;
    }
    seen.add(componentRoot);

    try {
      if (!fs.statSync(componentRoot).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const project = detectProject(componentRoot);
    if (!project || project.type === "unknown") {
      continue;
    }

    components.push({
      path: dirName,
      kind: inferComponentKind(dirName, project),
      ...project
    });
  }

  return components;
}

function detectProject(cwd) {
  try {
    // Check in priority order — first match wins
    const node = detectNode(cwd);
    if (node) return node;

    const python = detectPython(cwd);
    if (python) return python;

    const php = detectPhp(cwd);
    if (php) return php;

    const flutter = detectFlutter(cwd);
    if (flutter) return flutter;

    const go = detectGo(cwd);
    if (go) return go;

    if (fs.existsSync(path.join(cwd, "Cargo.toml")))
      return { type: "rust", packageManager: "cargo", framework: "" };

    if (fs.existsSync(path.join(cwd, "pom.xml")))
      return { type: "java", packageManager: "maven", framework: "" };

    if (fs.existsSync(path.join(cwd, "build.gradle")) || fs.existsSync(path.join(cwd, "build.gradle.kts")))
      return { type: "java", packageManager: "gradle", framework: "" };

    return { type: "unknown", packageManager: "", framework: "" };
  } catch {
    return { type: "unknown", packageManager: "", framework: "" };
  }
}

module.exports = { detectProject, detectProjectComponents };
