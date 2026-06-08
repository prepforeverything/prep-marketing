const path = require("path");
const { readJsonSafe } = require("./shared-utils.cjs");

// Project-stack source enum.
// stale = eligible for session-init refresh (came from auto-detection or
//         not yet recorded). explicit = user/wizard authored, never
//         overwritten by an auto-refresh.
const PROJECT_STACK_SOURCES = Object.freeze({
  REPO_DETECTED: "repo-detected",
  DETECTED: "detected",
  GREENFIELD_WIZARD: "greenfield-wizard",
  USER_CONFIRMED: "user-confirmed"
});
const STALE_PROJECT_STACK_SOURCES = new Set([
  PROJECT_STACK_SOURCES.REPO_DETECTED,
  PROJECT_STACK_SOURCES.DETECTED
]);
const EXPLICIT_PROJECT_STACK_SOURCES = new Set([
  PROJECT_STACK_SOURCES.GREENFIELD_WIZARD,
  PROJECT_STACK_SOURCES.USER_CONFIRMED
]);

// Languages whose marker files are deterministic enough that one match
// should set confidence = "deterministic" without further signal.
const DETERMINISTIC_LANGUAGE_MARKERS = new Set(["Dart", "Go", "Java", "PHP", "Python", "Rust"]);

function isStaleProjectStackSource(source) {
  if (typeof source !== "string") return true;
  if (source === "") return true;
  return STALE_PROJECT_STACK_SOURCES.has(source);
}

function isExplicitProjectStackSource(source) {
  return typeof source === "string" && EXPLICIT_PROJECT_STACK_SOURCES.has(source);
}

/**
 * Decide a confidence label for a freshly detected stack.
 *
 * "deterministic" — the language alone is unambiguous (e.g., pubspec.yaml /
 *   go.mod / Cargo.toml), or a language+framework pair was detected.
 * "inferred" — language-only with no framework, or unknown signals. Flutter
 *   facilitation surfaces should NOT auto-trigger from inferred stacks.
 */
function classifyDetectionConfidence({ language = "", framework = "" } = {}) {
  const trimmedLanguage = String(language || "").trim();
  const trimmedFramework = String(framework || "").trim();

  if (trimmedFramework) {
    return "deterministic";
  }
  if (DETERMINISTIC_LANGUAGE_MARKERS.has(trimmedLanguage)) {
    return "deterministic";
  }
  return "inferred";
}

const LANGUAGE_TO_TYPE = {
  Dart: "dart",
  Go: "go",
  Java: "java",
  JavaScript: "node",
  PHP: "php",
  Python: "python",
  Rust: "rust",
  TypeScript: "node"
};

const TYPE_TO_LANGUAGE = {
  dart: "Dart",
  go: "Go",
  java: "Java",
  node: "JavaScript",
  php: "PHP",
  python: "Python",
  rust: "Rust",
  unknown: ""
};

const PROJECT_KIND_KEYWORDS = {
  backend: ["backend", "api"],
  frontend: ["frontend"],
  "full-stack": ["frontend", "backend", "api"],
  mobile: ["frontend", "mobile"],
  cli: ["cli"],
  library: ["library"]
};

const AI_OBJECTIVE_KEYWORDS = ["ai", "llm", "ml", "nlp", "rag", "translation", "translate", "localization"];
const COMPONENT_SCAN_SUPPRESSED_STACK_SOURCES = new Set(["greenfield-wizard", "user-confirmed"]);

const STACK_PROFILES = [
  {
    id: "python-fastapi",
    kinds: ["backend"],
    language: "Python",
    framework: "FastAPI",
    packageManager: "uv",
    teamPreferences: ["python"],
    priorities: ["ai-data", "ship-fast"],
    objectiveKeywords: ["ai", "api", "embedding", "inference", "llm", "localization", "ml", "nlp", "service", "translation", "translate"],
    keywords: ["python", "fastapi", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "FastAPI is a strong default for service work that touches AI, NLP, or data-heavy workflows.",
    bootstrapCommand: "uv init . && uv add fastapi \"uvicorn[standard]\""
  },
  {
    id: "python-django",
    kinds: ["backend"],
    language: "Python",
    framework: "Django",
    packageManager: "uv",
    teamPreferences: ["python"],
    priorities: ["admin-crud"],
    objectiveKeywords: ["admin", "crud", "dashboard", "portal", "web"],
    keywords: ["python", "django", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "Django is the better Python default when the product needs a mature ORM, admin, auth, and fast CRUD delivery.",
    bootstrapCommand: "uv init . && uv add django"
  },
  {
    id: "go-gin",
    kinds: ["backend"],
    language: "Go",
    framework: "Gin",
    packageManager: "go",
    teamPreferences: ["go"],
    priorities: ["performance"],
    objectiveKeywords: ["api", "gateway", "latency", "performance", "service", "throughput"],
    keywords: ["go", "golang", "gin", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "Go + Gin is a better fit when the main requirement is latency, throughput, or operational simplicity.",
    bootstrapCommand: "go mod init . && go get github.com/gin-gonic/gin"
  },
  {
    id: "go-fiber",
    kinds: ["backend"],
    language: "Go",
    framework: "Fiber",
    packageManager: "go",
    teamPreferences: ["go"],
    priorities: ["performance"],
    objectiveKeywords: ["api", "gateway", "latency", "performance", "service", "throughput"],
    keywords: ["go", "golang", "fiber", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "Go + Fiber fits Go teams that prefer an Express-like handler style and accept the fasthttp tradeoffs.",
    bootstrapCommand: "go mod init . && go get github.com/gofiber/fiber/v2"
  },
  {
    id: "node-express",
    kinds: ["backend"],
    language: "TypeScript",
    framework: "Express",
    packageManager: "npm",
    teamPreferences: ["typescript", "javascript", "node"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["api", "service", "webhook"],
    keywords: ["typescript", "nodejs", "node.js", "express", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "TypeScript + Express keeps the startup path short for straightforward API and integration services.",
    bootstrapCommand: "npm init -y && npm install express && npm install -D typescript tsx @types/express @types/node"
  },
  {
    id: "node-nestjs",
    kinds: ["backend"],
    language: "TypeScript",
    framework: "NestJS",
    packageManager: "npm",
    teamPreferences: ["typescript", "javascript", "node"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["backend", "enterprise", "service"],
    keywords: ["typescript", "nodejs", "node.js", "nestjs", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "NestJS is a better TypeScript choice when the team wants stronger built-in structure than Express.",
    bootstrapCommand: "npx @nestjs/cli new . --package-manager npm"
  },
  {
    id: "php-laravel",
    kinds: ["backend", "full-stack"],
    language: "PHP",
    framework: "Laravel",
    packageManager: "composer",
    teamPreferences: ["php"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["admin", "crud", "dashboard", "portal", "web"],
    keywords: ["php", "laravel", "backend", "frontend"],
    recommendedPacks: ["backend"],
    rationale: "Laravel is a pragmatic greenfield choice when the team is PHP-heavy and wants fast delivery.",
    bootstrapCommand: "composer create-project laravel/laravel ."
  },
  {
    id: "java-spring-boot",
    kinds: ["backend"],
    language: "Java",
    framework: "Spring Boot",
    packageManager: "maven",
    teamPreferences: ["java"],
    priorities: ["performance"],
    objectiveKeywords: ["backend", "enterprise", "service"],
    keywords: ["java", "spring boot", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "Spring Boot fits teams that already operate in the Java ecosystem and need a conventional service platform.",
    bootstrapCommand: "spring init --build=maven --dependencies=web ."
  },
  {
    id: "rust-axum",
    kinds: ["backend"],
    language: "Rust",
    framework: "Axum",
    packageManager: "cargo",
    teamPreferences: ["rust"],
    priorities: ["performance"],
    objectiveKeywords: ["backend", "latency", "performance", "service"],
    keywords: ["rust", "axum", "backend", "api"],
    recommendedPacks: ["backend"],
    rationale: "Rust + Axum is a deliberate performance-first path when the team is already comfortable with Rust.",
    bootstrapCommand: "cargo init --bin . && cargo add axum tokio --features tokio/full"
  },
  {
    id: "nextjs",
    kinds: ["frontend", "full-stack"],
    language: "TypeScript",
    framework: "Next.js",
    packageManager: "npm",
    teamPreferences: ["typescript", "javascript", "react"],
    priorities: ["seo", "ship-fast"],
    objectiveKeywords: ["dashboard", "marketing", "portal", "seo", "web"],
    keywords: ["typescript", "react", "next.js", "frontend"],
    recommendedPacks: ["frontend", "backend"],
    rationale: "Next.js is the safest default for web apps that need React and might care about SEO or server rendering.",
    bootstrapCommand: "npx create-next-app@latest ."
  },
  {
    id: "react-vite",
    kinds: ["frontend"],
    language: "TypeScript",
    framework: "React",
    packageManager: "npm",
    teamPreferences: ["typescript", "javascript", "react"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["dashboard", "internal", "portal", "web"],
    keywords: ["typescript", "react", "frontend"],
    recommendedPacks: ["frontend"],
    rationale: "React + Vite is a leaner web default when SSR is not a core requirement.",
    bootstrapCommand: "npm create vite@latest . -- --template react-ts"
  },
  {
    id: "nuxt",
    kinds: ["frontend", "full-stack"],
    language: "TypeScript",
    framework: "Nuxt",
    packageManager: "npm",
    teamPreferences: ["vue"],
    priorities: ["seo"],
    objectiveKeywords: ["marketing", "portal", "seo", "web"],
    keywords: ["typescript", "vue", "nuxt", "frontend"],
    recommendedPacks: ["frontend", "backend"],
    rationale: "Nuxt is the right web recommendation when the team prefers Vue and still needs SSR or SEO support.",
    bootstrapCommand: "npx nuxi@latest init ."
  },
  {
    id: "vue-vite",
    kinds: ["frontend"],
    language: "TypeScript",
    framework: "Vue",
    packageManager: "npm",
    teamPreferences: ["vue"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["dashboard", "internal", "web"],
    keywords: ["typescript", "vue", "frontend"],
    recommendedPacks: ["frontend"],
    rationale: "Vue + Vite is a simple web default when the team prefers Vue and does not need SSR on day one.",
    bootstrapCommand: "npm create vite@latest . -- --template vue-ts"
  },
  {
    id: "flutter",
    kinds: ["mobile", "frontend"],
    language: "Dart",
    framework: "Flutter",
    packageManager: "flutter pub",
    teamPreferences: ["flutter"],
    priorities: ["native", "ship-fast"],
    objectiveKeywords: ["android", "ios", "mobile", "native"],
    keywords: ["dart", "flutter", "frontend", "mobile"],
    recommendedPacks: ["frontend"],
    rationale: "Flutter is the clear default when the app must ship as a cross-platform native mobile client.",
    bootstrapCommand: "flutter create ."
  },
  {
    id: "node-cli",
    kinds: ["cli", "library"],
    language: "TypeScript",
    framework: "",
    packageManager: "npm",
    teamPreferences: ["typescript", "javascript", "node"],
    priorities: ["ship-fast"],
    objectiveKeywords: ["cli", "command", "tool"],
    keywords: ["typescript", "nodejs", "node.js", "cli"],
    recommendedPacks: ["backend"],
    rationale: "TypeScript is a sensible CLI and library default when the team is already in the Node ecosystem.",
    bootstrapCommand: "npm init -y && npm install -D typescript tsx @types/node"
  },
  {
    id: "go-cli",
    kinds: ["cli"],
    language: "Go",
    framework: "",
    packageManager: "go",
    teamPreferences: ["go"],
    priorities: ["performance"],
    objectiveKeywords: ["cli", "command", "tool"],
    keywords: ["go", "golang", "cli"],
    recommendedPacks: ["backend"],
    rationale: "Go is a clean CLI default when you want a static binary and already know the language well.",
    bootstrapCommand: "go mod init ."
  }
];

const PROFILE_BY_ID = new Map(STACK_PROFILES.map((profile) => [profile.id, profile]));

const FRAMEWORK_TO_PROFILE_ID = {
  "Next.js": "nextjs",
  Nuxt: "nuxt",
  React: "react-vite",
  Vue: "vue-vite",
  Flutter: "flutter",
  FastAPI: "python-fastapi",
  Django: "python-django",
  Gin: "go-gin",
  Fiber: "go-fiber",
  Express: "node-express",
  NestJS: "node-nestjs",
  Laravel: "php-laravel",
  "Spring Boot": "java-spring-boot",
  Axum: "rust-axum"
};

const LANGUAGE_SKILL_IDS = {
  Go: "backend-go",
  Java: "backend-java",
  JavaScript: "backend-nodejs",
  PHP: "backend-php",
  Python: "backend-python",
  Rust: "backend-rust",
  TypeScript: "backend-nodejs"
};

const BACKEND_FRAMEWORK_SKILL_IDS = {
  Actix: "backend-rust-actix-web",
  "Actix Web": "backend-rust-actix-web",
  Axum: "backend-rust-axum",
  Django: "backend-python-django",
  Express: "backend-nodejs-express",
  FastAPI: "backend-python-fastapi",
  Fiber: "backend-go-fiber",
  Gin: "backend-go-gin",
  Laravel: "backend-php-laravel",
  NestJS: "backend-nodejs-nestjs",
  Quarkus: "backend-java-quarkus",
  "Spring Boot": "backend-java-spring-boot"
};

const FRONTEND_SKILL_IDS = {
  Flutter: ["frontend-flutter", "flutter-dev"],
  "Next.js": ["frontend-react", "frontend-nextjs"],
  Nuxt: ["frontend-vue", "frontend-nuxt"],
  React: ["frontend-react"],
  Vue: ["frontend-vue"]
};

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function inferObjectiveKeywords(objective = "") {
  const normalized = normalizeLower(objective);
  if (!normalized) {
    return [];
  }

  const keywords = new Set();
  for (const token of normalized.split(/[^a-z0-9.+-]+/)) {
    if (!token) {
      continue;
    }
    keywords.add(token);
    if (token === "translation" || token === "translate" || token === "localization") {
      keywords.add("ai");
      keywords.add("ml");
      keywords.add("nlp");
    }
    if (token === "llm") {
      keywords.add("ai");
      keywords.add("ml");
    }
  }
  return [...keywords];
}

function languageForProjectType(type, detectedLanguage = "") {
  const normalizedLanguage = String(detectedLanguage || "").trim();
  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  return TYPE_TO_LANGUAGE[normalizeLower(type)] || "";
}

function inferProjectKindFromStack(stack) {
  const normalizedFramework = String(stack?.framework || "");
  const normalizedLanguage = String(stack?.language || "");
  const normalizedProfileId = String(stack?.profileId || "");
  const profile = PROFILE_BY_ID.get(normalizedProfileId);
  if (profile?.kinds?.length) {
    return profile.kinds.includes("mobile") ? "mobile" : profile.kinds[0];
  }
  if (normalizedFramework === "Flutter") return "mobile";
  if (["Next.js", "Nuxt", "React", "Vue"].includes(normalizedFramework)) return "frontend";
  if (["Go", "Java", "JavaScript", "PHP", "Python", "Rust", "TypeScript"].includes(normalizedLanguage)) return "backend";
  return "";
}

function profileForDetectedProject(detectedProject = {}, { kind = "", detectedLanguage = "" } = {}) {
  const frameworkProfileId = FRAMEWORK_TO_PROFILE_ID[String(detectedProject.framework || "")];
  if (frameworkProfileId) {
    return PROFILE_BY_ID.get(frameworkProfileId) || null;
  }

  const type = normalizeLower(detectedProject.type);
  const language = languageForProjectType(type, detectedLanguage);
  const normalizedKind = normalizeLower(kind);

  if (type === "dart" || language === "Dart") return PROFILE_BY_ID.get("flutter") || null;
  if (type === "node" && normalizedKind === "frontend") return PROFILE_BY_ID.get("react-vite") || null;
  if (type === "node" && normalizedKind === "backend") return PROFILE_BY_ID.get("node-express") || null;
  if (type === "python" && normalizedKind === "backend") return PROFILE_BY_ID.get("python-fastapi") || null;
  if (type === "php") return PROFILE_BY_ID.get("php-laravel") || null;
  if (type === "java") return PROFILE_BY_ID.get("java-spring-boot") || null;
  if (type === "rust") return PROFILE_BY_ID.get("rust-axum") || null;

  return null;
}

function detectedProjectToStack(detectedProject = {}, { path: componentPath = "", kind = "", source = "repo-detected", detectedLanguage = "" } = {}) {
  if (!hasDetectedProjectSignals(detectedProject)) {
    return null;
  }

  const profile = profileForDetectedProject(detectedProject, { kind, detectedLanguage });
  const language = profile?.language || languageForProjectType(detectedProject.type, detectedLanguage);
  const framework = String(detectedProject.framework || profile?.framework || "");
  const packageManager = String(detectedProject.packageManager || profile?.packageManager || "");
  const projectKind = normalizeLower(kind) || inferProjectKindFromStack({
    profileId: profile?.id || "",
    language,
    framework
  });

  return normalizeStackComponent({
    version: 1,
    source,
    path: componentPath,
    profileId: profile?.id || "",
    projectKind,
    kind: projectKind,
    language,
    framework,
    packageManager,
    recommendedPacks: profile?.recommendedPacks || [],
    bootstrapCommand: profile?.bootstrapCommand || "",
    rationale: profile?.rationale || ""
  });
}

function aggregateProjectKind(components = [], fallback = "") {
  const kinds = new Set(
    components
      .map((component) => normalizeLower(component.projectKind || component.kind))
      .filter(Boolean)
  );
  if (kinds.has("backend") && (kinds.has("frontend") || kinds.has("mobile"))) {
    return "full-stack";
  }
  if (components.length > 1 && kinds.size > 1) {
    return "full-stack";
  }
  if (components.length > 1 && kinds.size === 1) {
    return [...kinds][0];
  }
  return normalizeLower(fallback) || normalizeLower(components[0]?.projectKind || components[0]?.kind);
}

function projectStackFromComponents(components = [], {
  source = "repo-detected",
  existing = null,
  projectKind = ""
} = {}) {
  const normalizedComponents = (Array.isArray(components) ? components : [])
    .map((component) => normalizeStackComponent(component))
    .filter(Boolean);

  if (normalizedComponents.length === 0) {
    return null;
  }

  const existingStack = normalizeProjectStack(existing);
  return normalizeProjectStack({
    version: 1,
    source: source || existingStack?.source || "repo-detected",
    profileId: "",
    projectKind: aggregateProjectKind(normalizedComponents, projectKind || existingStack?.projectKind),
    objective: existingStack?.objective || "",
    priority: existingStack?.priority || "",
    teamPreference: existingStack?.teamPreference || "",
    language: "",
    framework: "",
    packageManager: "",
    recommendedPacks: recommendedPacksFromComponents(normalizedComponents),
    bootstrapCommand: "",
    bootstrapStatus: existingStack?.bootstrapStatus || "",
    recommendedPreset: existingStack?.recommendedPreset || "",
    rationale: "",
    components: normalizedComponents
  });
}

function projectStackFromDetectedComponents(detectedComponents = [], { source = "repo-detected" } = {}) {
  const components = (Array.isArray(detectedComponents) ? detectedComponents : [])
    .map((component) => detectedProjectToStack(component, {
      path: component.path || "",
      kind: component.kind || "",
      source
    }))
    .filter(Boolean);

  if (components.length === 0) {
    return null;
  }

  return projectStackFromComponents(components, { source });
}

function shouldUseRootProjectAsComponent(detectedProject = {}) {
  if (!hasDetectedProjectSignals(detectedProject)) {
    return false;
  }

  const type = normalizeLower(detectedProject.type);
  const framework = String(detectedProject.framework || "").trim();
  if (type === "node" && !framework) {
    return false;
  }

  return true;
}

function projectStackFromDetectedContext(detectedProject = {}, detectedComponents = [], {
  source = "repo-detected",
  detectedLanguage = ""
} = {}) {
  const componentStack = projectStackFromDetectedComponents(detectedComponents, { source });
  if (!componentStack) {
    return null;
  }

  const components = componentStack.components || [];
  if (!shouldUseRootProjectAsComponent(detectedProject)) {
    return componentStack;
  }

  const rootComponent = detectedProjectToStack(detectedProject, {
    path: ".",
    source,
    detectedLanguage
  });
  if (!rootComponent) {
    return componentStack;
  }

  return projectStackFromComponents([rootComponent, ...components], {
    source,
    projectKind: components.length > 0 ? "full-stack" : rootComponent.projectKind
  });
}

function projectStackFromProfile(profileId, {
  path: componentPath = "",
  kind = "",
  source = "user-confirmed",
  objective = "",
  priority = "",
  teamPreference = "",
  recommendedPreset = ""
} = {}) {
  const profile = PROFILE_BY_ID.get(String(profileId || ""));
  if (!profile) {
    return null;
  }

  return normalizeStackComponent({
    version: 1,
    source,
    path: componentPath,
    profileId: profile.id,
    projectKind: normalizeLower(kind) || profile.kinds[0] || "",
    kind: normalizeLower(kind) || profile.kinds[0] || "",
    objective,
    priority,
    teamPreference,
    language: profile.language,
    framework: profile.framework,
    packageManager: profile.packageManager,
    recommendedPacks: profile.recommendedPacks,
    bootstrapCommand: profile.bootstrapCommand,
    recommendedPreset,
    rationale: profile.rationale
  });
}

function upsertProjectStackComponent(existingStack, component) {
  const normalizedComponent = normalizeStackComponent(component);
  if (!normalizedComponent) {
    return normalizeProjectStack(existingStack);
  }

  const existing = normalizeProjectStack(existingStack) || {
    version: 1,
    source: normalizedComponent.source || "user-confirmed",
    profileId: "",
    projectKind: "",
    objective: "",
    priority: "",
    teamPreference: "",
    language: "",
    framework: "",
    packageManager: "",
    recommendedPacks: [],
    bootstrapCommand: "",
    bootstrapStatus: "",
    recommendedPreset: "",
    rationale: "",
    components: []
  };

  const components = [...(existing.components || [])];
  const targetPath = normalizedComponent.path || ".";
  const existingIndex = components.findIndex((entry) => (entry.path || ".") === targetPath);
  if (existingIndex >= 0) {
    components[existingIndex] = normalizedComponent;
  } else {
    components.push(normalizedComponent);
  }

  return projectStackFromComponents(components, {
    existing,
    source: normalizedComponent.source || existing.source || "user-confirmed"
  });
}

function hasDetectedProjectSignals(detectedProject) {
  const normalizedType = normalizeLower(detectedProject?.type);
  return (
    (normalizedType && normalizedType !== "unknown") ||
    String(detectedProject?.framework || "").trim() !== "" ||
    String(detectedProject?.packageManager || "").trim() !== ""
  );
}

function isPrepkitRuntimePackage(targetRoot) {
  const pkg = readJsonSafe(path.join(targetRoot, "package.json"));
  if (!pkg || typeof pkg !== "object") {
    return false;
  }

  const prepkitBin = pkg.bin || {};
  return (
    typeof prepkitBin === "object" &&
    String(prepkitBin.prepkit || "").includes("scripts/prepkit-cli.mjs") &&
    String(prepkitBin.prep || "").includes("scripts/prepkit-cli.mjs")
  );
}

function suppressPrepkitRuntimeDetection(targetRoot, detectedProject, storedProjectStack) {
  if (!normalizeProjectStack(storedProjectStack) || !isPrepkitRuntimePackage(targetRoot)) {
    return detectedProject;
  }

  // Only suppress when the user (or greenfield wizard) explicitly authored
  // the stored stack. Auto-detected sources are filled by session-init's
  // refresh path and must not silence the real package.json — that would
  // hide cross-pack driver signals (pg → postgresql, etc.) from skill routing.
  if (!isExplicitProjectStackSource(storedProjectStack?.source)) {
    return detectedProject;
  }

  const normalizedType = normalizeLower(detectedProject?.type);
  const framework = String(detectedProject?.framework || "").trim();

  if (normalizedType === "node" && !framework) {
    return { type: "unknown", framework: "", packageManager: "" };
  }

  return detectedProject;
}

function formatProjectStackLabel(stack) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return "";
  }

  if (normalized.components.length > 0) {
    return normalized.components
      .map((component) => {
        const label = [component.language, component.framework, component.packageManager]
          .filter(Boolean)
          .join(" / ");
        return component.path ? `${component.path}: ${label}` : label;
      })
      .filter(Boolean)
      .join("; ");
  }

  return [normalized.language, normalized.framework, normalized.packageManager]
    .filter(Boolean)
    .join(" / ");
}

function mergeDetectedStack(stored, detected, { source = "detected+stored", resetProfileMetadata = false } = {}) {
  if ((stored.components || []).length > 0) {
    return {
      stack: projectStackFromComponents(stored.components, {
        existing: stored,
        source: stored.source || "stored",
        projectKind: stored.projectKind
      }),
      source: stored.source === "user-confirmed" ? "stored" : source
    };
  }

  const detectedProfile = profileForDetectedProject({
    type: LANGUAGE_TO_TYPE[detected.language] || "unknown",
    framework: detected.framework,
    packageManager: detected.packageManager
  }, { kind: stored.projectKind });
  const next = {
    ...stored,
    source: "repo-detected",
    language: detected.language || stored.language,
    framework: detected.framework || stored.framework,
    packageManager: detected.packageManager || stored.packageManager
  };

  if (resetProfileMetadata) {
    next.profileId = detectedProfile?.id || "";
    next.projectKind = detectedProfile?.kinds?.[0] || "";
    next.objective = "";
    next.priority = "";
    next.teamPreference = "";
    next.recommendedPacks = detectedProfile ? [...detectedProfile.recommendedPacks] : [];
    next.bootstrapCommand = detectedProfile?.bootstrapCommand || "";
    next.recommendedPreset = "";
    next.rationale = detectedProfile?.rationale || "";
  }

  return {
    stack: normalizeProjectStack(next),
    source
  };
}

function resolveProjectStack(detectedProject = null, storedProjectStack = null, { detectedLanguage = "" } = {}) {
  const stored = normalizeProjectStack(storedProjectStack);
  if (!hasDetectedProjectSignals(detectedProject)) {
    return {
      stack: stored,
      source: stored ? "stored" : ""
    };
  }

  const detectedType = normalizeLower(detectedProject?.type) || "unknown";
  const detected = {
    language: languageForProjectType(detectedType, detectedLanguage),
    framework: String(detectedProject?.framework || ""),
    packageManager: String(detectedProject?.packageManager || "")
  };

  if (!stored) {
    const detectedStack = detectedProjectToStack(detectedProject, {
      source: "repo-detected",
      detectedLanguage
    });
    return {
      stack: detectedStack,
      source: "detected"
    };
  }

  const storedType = LANGUAGE_TO_TYPE[stored.language] || "unknown";
  const hasConflictingRuntime =
    detectedType !== "unknown" &&
    storedType !== "unknown" &&
    detectedType !== storedType;
  const hasConflictingFramework =
    Boolean(detected.framework) &&
    normalizeLower(detected.framework) !== normalizeLower(stored.framework);

  if (hasConflictingRuntime) {
    return mergeDetectedStack(stored, detected, {
      source: "detected",
      resetProfileMetadata: true
    });
  }

  if (hasConflictingFramework) {
    return mergeDetectedStack(stored, detected, {
      source: "detected+stored",
      resetProfileMetadata: true
    });
  }

  return mergeDetectedStack(stored, detected, { source: "detected+stored" });
}

function packRecommendationsForProfile(profile, objectiveKeywords) {
  const recommendedPacks = new Set(profile.recommendedPacks || []);
  if (objectiveKeywords.some((keyword) => AI_OBJECTIVE_KEYWORDS.includes(keyword))) {
    recommendedPacks.add("ai-ml");
  }
  return [...recommendedPacks];
}

function profileScore(profile, { projectKind, teamPreference, priority, objectiveKeywords }) {
  let score = 0;

  if (profile.kinds.includes(projectKind)) {
    score += 60;
  }

  if (teamPreference && profile.teamPreferences.includes(teamPreference)) {
    score += 30;
  }

  if (priority && profile.priorities.includes(priority)) {
    score += 25;
  }

  const objectiveHits = objectiveKeywords.filter((keyword) => profile.objectiveKeywords.includes(keyword)).length;
  if (objectiveHits > 0) {
    score += Math.min(objectiveHits, 3) * 15;
  }

  if (!teamPreference) {
    if (priority === "ai-data" && profile.id === "python-fastapi") score += 10;
    if (priority === "performance" && profile.id === "go-gin") score += 10;
    if (priority === "seo" && (profile.id === "nextjs" || profile.id === "nuxt")) score += 10;
    if (priority === "native" && profile.id === "flutter") score += 10;
  }

  return score;
}

function buildRecommendationRecord(profile, inputs, objectiveKeywords) {
  const components = inputs.components || [];
  return {
    version: 1,
    source: "greenfield-wizard",
    profileId: profile.id,
    projectKind: inputs.projectKind,
    objective: inputs.objective || "",
    priority: inputs.priority || "",
    teamPreference: inputs.teamPreference || "",
    language: profile.language,
    framework: profile.framework,
    packageManager: profile.packageManager,
    recommendedPacks: components.length > 0
      ? [...new Set([...packRecommendationsForProfile(profile, objectiveKeywords), ...recommendedPacksFromComponents(components)])]
      : packRecommendationsForProfile(profile, objectiveKeywords),
    bootstrapCommand: profile.bootstrapCommand,
    bootstrapStatus: "",
    recommendedPreset: inputs.recommendedPreset || "",
    rationale: profile.rationale,
    components
  };
}

function pickProfileForKind(kind, inputs, objectiveKeywords, fallbackId) {
  const normalizedKind = normalizeLower(kind);
  const normalizedTeamPreference = normalizeLower(inputs.teamPreference);
  const normalizedPriority = normalizeLower(inputs.priority) || "ship-fast";

  const candidate = STACK_PROFILES
    .filter((profile) => profile.kinds.includes(normalizedKind))
    .map((profile) => ({
      profile,
      score: profileScore(profile, {
        projectKind: normalizedKind,
        teamPreference: normalizedTeamPreference,
        priority: normalizedPriority,
        objectiveKeywords
      })
    }))
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id))[0]?.profile;

  return candidate || PROFILE_BY_ID.get(fallbackId) || STACK_PROFILES[0];
}

function composeFullStackComponents(inputs, objectiveKeywords) {
  const frontend = pickProfileForKind("frontend", inputs, objectiveKeywords, "react-vite");
  const backend = pickProfileForKind("backend", inputs, objectiveKeywords, "node-express");

  return [
    normalizeStackComponent({
      source: "greenfield-wizard",
      path: "frontend",
      kind: "frontend",
      projectKind: "frontend",
      profileId: frontend.id,
      objective: inputs.objective,
      priority: inputs.priority,
      teamPreference: inputs.teamPreference,
      recommendedPreset: inputs.recommendedPreset
    }),
    normalizeStackComponent({
      source: "greenfield-wizard",
      path: "backend",
      kind: "backend",
      projectKind: "backend",
      profileId: backend.id,
      objective: inputs.objective,
      priority: inputs.priority,
      teamPreference: inputs.teamPreference,
      recommendedPreset: inputs.recommendedPreset
    })
  ].filter(Boolean);
}

function recommendProjectStack({
  projectKind = "backend",
  objective = "",
  teamPreference = "",
  priority = "ship-fast",
  recommendedPreset = ""
} = {}) {
  const normalizedProjectKind = normalizeLower(projectKind) || "backend";
  const normalizedTeamPreference = normalizeLower(teamPreference);
  const normalizedPriority = normalizeLower(priority) || "ship-fast";
  const objectiveKeywords = inferObjectiveKeywords(objective);

  const candidates = STACK_PROFILES
    .filter((profile) => profile.kinds.includes(normalizedProjectKind))
    .map((profile) => ({
      profile,
      score: profileScore(profile, {
        projectKind: normalizedProjectKind,
        teamPreference: normalizedTeamPreference,
        priority: normalizedPriority,
        objectiveKeywords
      })
    }))
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id));

  const [primaryCandidate, alternativeCandidate] = candidates;
  const primaryProfile = primaryCandidate?.profile || STACK_PROFILES[0];
  const alternativeProfile = alternativeCandidate?.profile && alternativeCandidate.profile.id !== primaryProfile.id
    ? alternativeCandidate.profile
    : null;
  const components = normalizedProjectKind === "full-stack"
    ? composeFullStackComponents({
      projectKind: normalizedProjectKind,
      objective,
      teamPreference: normalizedTeamPreference,
      priority: normalizedPriority,
      recommendedPreset
    }, objectiveKeywords)
    : [];

  return {
    primary: buildRecommendationRecord(primaryProfile, {
      projectKind: normalizedProjectKind,
      objective,
      teamPreference: normalizedTeamPreference,
      priority: normalizedPriority,
      recommendedPreset,
      components
    }, objectiveKeywords),
    alternative: alternativeProfile
      ? buildRecommendationRecord(alternativeProfile, {
        projectKind: normalizedProjectKind,
        objective,
        teamPreference: normalizedTeamPreference,
        priority: normalizedPriority,
        recommendedPreset
      }, objectiveKeywords)
      : null
  };
}

function normalizePacks(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function normalizeStackComponent(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const profile = raw.profileId ? PROFILE_BY_ID.get(String(raw.profileId)) : null;
  const component = {
    version: 1,
    source: String(raw.source || ""),
    path: String(raw.path || ""),
    profileId: String(raw.profileId || ""),
    projectKind: normalizeLower(raw.projectKind || raw.kind),
    kind: normalizeLower(raw.kind || raw.projectKind),
    objective: String(raw.objective || ""),
    priority: normalizeLower(raw.priority),
    teamPreference: normalizeLower(raw.teamPreference),
    language: String(raw.language || ""),
    framework: String(raw.framework || ""),
    packageManager: String(raw.packageManager || ""),
    recommendedPacks: normalizePacks(raw.recommendedPacks),
    bootstrapCommand: String(raw.bootstrapCommand || ""),
    bootstrapStatus: String(raw.bootstrapStatus || ""),
    recommendedPreset: String(raw.recommendedPreset || ""),
    rationale: String(raw.rationale || "")
  };

  if (profile) {
    component.language ||= profile.language;
    component.framework ||= profile.framework;
    component.packageManager ||= profile.packageManager;
    component.projectKind ||= profile.kinds[0] || "";
    component.kind ||= component.projectKind;
    if (component.recommendedPacks.length === 0) {
      component.recommendedPacks = [...profile.recommendedPacks];
    }
    component.rationale ||= profile.rationale;
    component.bootstrapCommand ||= profile.bootstrapCommand;
  }

  component.kind ||= inferProjectKindFromStack(component);
  component.projectKind ||= component.kind;

  if (!component.language && !component.framework && !component.projectKind && !component.profileId) {
    return null;
  }

  return component;
}

function recommendedPacksFromComponents(components = []) {
  const packs = new Set();
  for (const component of components) {
    for (const pack of component.recommendedPacks || []) {
      packs.add(pack);
    }
  }
  return [...packs];
}

function normalizeProjectStack(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const components = Array.isArray(raw.components)
    ? raw.components.map((component) => normalizeStackComponent(component)).filter(Boolean)
    : [];

  const stack = {
    version: 1,
    source: String(raw.source || ""),
    profileId: String(raw.profileId || ""),
    projectKind: normalizeLower(raw.projectKind),
    objective: String(raw.objective || ""),
    priority: normalizeLower(raw.priority),
    teamPreference: normalizeLower(raw.teamPreference),
    language: String(raw.language || ""),
    framework: String(raw.framework || ""),
    packageManager: String(raw.packageManager || ""),
    recommendedPacks: normalizePacks(raw.recommendedPacks),
    bootstrapCommand: String(raw.bootstrapCommand || ""),
    bootstrapStatus: String(raw.bootstrapStatus || ""),
    recommendedPreset: String(raw.recommendedPreset || ""),
    rationale: String(raw.rationale || ""),
    components
  };

  if (!stack.language && !stack.framework && !stack.projectKind && !stack.profileId && stack.components.length === 0) {
    return null;
  }

  if (stack.profileId) {
    const profile = PROFILE_BY_ID.get(stack.profileId);
    if (profile) {
      stack.language ||= profile.language;
      stack.framework ||= profile.framework;
      stack.packageManager ||= profile.packageManager;
      stack.projectKind ||= profile.kinds[0] || "";
      if (stack.recommendedPacks.length === 0) {
        stack.recommendedPacks = [...profile.recommendedPacks];
      }
      stack.rationale ||= profile.rationale;
      stack.bootstrapCommand ||= profile.bootstrapCommand;
    }
  }

  if (stack.recommendedPacks.length === 0 && stack.components.length > 0) {
    stack.recommendedPacks = recommendedPacksFromComponents(stack.components);
  }

  return stack;
}

function readStoredProjectStack(targetRoot) {
  const kitState = readJsonSafe(path.join(targetRoot, ".prepkit", "kit-state.json"));
  return normalizeProjectStack(kitState?.projectStack);
}

function shouldPreserveStoredProjectStack(storedProjectStack) {
  const normalized = normalizeProjectStack(storedProjectStack);
  return COMPONENT_SCAN_SUPPRESSED_STACK_SOURCES.has(normalizeLower(normalized?.source));
}

function projectDescriptorFromStack(stack) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return null;
  }

  const primary = normalized.components.length > 0
    ? normalized.components[0]
    : normalized;
  if (!primary) {
    return null;
  }

  return {
    type: LANGUAGE_TO_TYPE[primary.language] || "unknown",
    framework: primary.framework,
    packageManager: primary.packageManager
  };
}

function projectStackKeywords(stack) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return [];
  }

  const keywords = new Set(PROJECT_KIND_KEYWORDS[normalized.projectKind] || []);
  if (normalized.components.length > 0) {
    for (const component of normalized.components) {
      for (const keyword of projectStackKeywords({ ...component, components: [] })) {
        keywords.add(keyword);
      }
      if (component.path) {
        keywords.add(component.path.toLowerCase());
      }
    }
    return [...keywords].filter(Boolean).sort();
  }

  const profile = PROFILE_BY_ID.get(normalized.profileId);
  if (profile) {
    for (const keyword of profile.keywords) {
      keywords.add(keyword);
    }
  }

  for (const keyword of inferObjectiveKeywords(normalized.objective)) {
    keywords.add(keyword);
  }

  if (normalized.language === "TypeScript") {
    keywords.add("typescript");
    keywords.add("nodejs");
    keywords.add("node.js");
  } else if (normalized.language === "Go") {
    keywords.add("go");
    keywords.add("golang");
  } else if (normalized.language) {
    keywords.add(normalized.language.toLowerCase());
  }

  if (normalized.framework) {
    keywords.add(normalized.framework.toLowerCase());
  }

  for (const component of normalized.components || []) {
    for (const keyword of projectStackKeywords({ ...component, components: [] })) {
      keywords.add(keyword);
    }
    if (component.path) {
      keywords.add(component.path.toLowerCase());
    }
  }

  return [...keywords].filter(Boolean).sort();
}

function skillIdsForComponent(component) {
  const normalized = normalizeStackComponent(component);
  if (!normalized) {
    return [];
  }

  const ids = new Set();
  const kind = normalized.kind || normalized.projectKind || inferProjectKindFromStack(normalized);

  if (kind === "frontend" || kind === "mobile" || FRONTEND_SKILL_IDS[normalized.framework]) {
    for (const skillId of FRONTEND_SKILL_IDS[normalized.framework] || []) {
      ids.add(skillId);
    }
    if (!normalized.framework && normalized.language === "Dart") {
      ids.add("frontend-flutter");
      ids.add("flutter-dev");
    }
  }

  if (kind === "backend" || BACKEND_FRAMEWORK_SKILL_IDS[normalized.framework]) {
    const languageSkill = LANGUAGE_SKILL_IDS[normalized.language];
    if (languageSkill) {
      ids.add(languageSkill);
    }
    const frameworkSkill = BACKEND_FRAMEWORK_SKILL_IDS[normalized.framework];
    if (frameworkSkill) {
      ids.add(frameworkSkill);
    }
  }

  return [...ids];
}

function projectStackSkillIds(stack) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return [];
  }

  const ids = new Set();
  if (normalized.components.length === 0) {
    for (const id of skillIdsForComponent(normalized)) {
      ids.add(id);
    }
  }
  for (const component of normalized.components || []) {
    for (const id of skillIdsForComponent(component)) {
      ids.add(id);
    }
  }
  return [...ids];
}

function projectStackComponentsWithSkills(stack) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return [];
  }

  const components = normalized.components.length > 0
    ? normalized.components
    : [normalized];

  return components.map((component) => ({
    ...component,
    skillIds: skillIdsForComponent(component)
  }));
}

function humanizePriority(priority) {
  const normalized = normalizeLower(priority);
  if (normalized === "ship-fast") return "Delivery speed";
  if (normalized === "performance") return "Latency and throughput";
  if (normalized === "seo") return "SEO and server rendering";
  if (normalized === "ai-data") return "AI and data workflow fit";
  if (normalized === "native") return "Native mobile experience";
  return "Not yet recorded";
}

function humanizeResolutionSource(resolutionSource, stackSource) {
  if (resolutionSource === "detected") {
    return "Current repository detection";
  }
  if (resolutionSource === "detected+stored") {
    return "Current repository detection with recorded bootstrap context";
  }
  if (stackSource === "greenfield-wizard") {
    return "Recorded greenfield stack choice";
  }
  return "Recorded PrepKit state";
}

function cleanMarkdownValue(value, fallback = "Not yet recorded") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function renderStackDecisionSpec({ planTitle = "", stack, resolutionSource = "" } = {}) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    return "";
  }

  const title = cleanMarkdownValue(planTitle, "Current Project");
  const hasComponents = (normalized.components || []).length > 0;
  const runtimeChoice = hasComponents
    ? cleanMarkdownValue(formatProjectStackLabel(normalized), "Current runtime")
    : normalized.framework
      ? `${normalized.language} with ${normalized.framework}`.trim()
      : cleanMarkdownValue(normalized.language, formatProjectStackLabel(normalized) || "Current runtime");
  const toolchainChoice = hasComponents
    ? cleanMarkdownValue(
        normalized.components
          .map((component) => `${component.path || component.kind || "component"}: ${component.packageManager || "default toolchain"}`)
          .join("; "),
        "Use the repository's native package managers"
      )
    : cleanMarkdownValue(normalized.packageManager, "Use the repository's native package manager");
  const packChoice = normalized.recommendedPacks.length > 0
    ? normalized.recommendedPacks.join(", ")
    : "No extra packs recorded";
  const componentLines = (normalized.components || []).map((component) => {
    const label = component.framework
      ? `${component.language} with ${component.framework}`.trim()
      : cleanMarkdownValue(component.language, "Unknown runtime");
    const skills = skillIdsForComponent(component).join(", ") || "No exact skill mapping";
    return `- **${cleanMarkdownValue(component.path || component.kind || "component")}:** ${label} (${cleanMarkdownValue(component.packageManager, "default toolchain")}) — skills: ${skills}`;
  });

  return [
    "<!-- PREPKIT:STACK DECISION AUTO-GENERATED -->",
    `# Stack Decision: ${title}`,
    "",
    "> Auto-generated from PrepKit's recorded stack state and current repository detection.",
    "",
    "## Context Snapshot",
    "",
    `- **Problem domain:** ${cleanMarkdownValue(normalized.objective)}`,
    `- **Key objective:** ${humanizePriority(normalized.priority)}`,
    `- **Team:** ${cleanMarkdownValue(normalized.teamPreference)}`,
    `- **Current stack:** ${cleanMarkdownValue(formatProjectStackLabel(normalized), "Unknown")}`,
    `- **Signal source:** ${humanizeResolutionSource(resolutionSource, normalized.source)}`,
    `- **Bootstrap status:** ${cleanMarkdownValue(normalized.bootstrapStatus)}`,
    "",
    "## Decisions Made",
    "",
    "### Application Runtime",
    "",
    `- **Chosen:** ${runtimeChoice}`,
    `- **Why:** ${cleanMarkdownValue(normalized.rationale, "PrepKit recorded this as the current best-fit runtime for the project.")}`,
    "- **Alternatives considered:** PrepKit did not persist alternatives in this flow.",
    "- **YAGNI note:** Keep the first runnable slice narrow until requirements force more infrastructure.",
    "",
    ...(componentLines.length > 0 ? [
      "### Component Topology",
      "",
      ...componentLines,
      ""
    ] : []),
    "### Toolchain",
    "",
    `- **Chosen:** ${toolchainChoice}`,
    "- **Why:** Keep scaffolding and day-one workflows aligned with the actual repository toolchain.",
    "- **Alternatives considered:** PrepKit will only suggest a different toolchain after the stack decision changes.",
    "- **YAGNI note:** Avoid adding extra build tools before there is a concrete need.",
    "",
    "### PrepKit Packs",
    "",
    `- **Chosen:** ${packChoice}`,
    "- **Why:** These packs activate the most relevant facilitation and domain skills for the current stack.",
    "- **Alternatives considered:** Start with the recorded packs and expand only when scope truly changes.",
    "- **YAGNI note:** Do not install extra packs just because the ecosystem might need them later.",
    "",
    "## Revisit Triggers",
    "",
    "- [ ] Repository files indicate a different runtime or framework than this record.",
    "- [ ] The team chooses a different framework, package manager, or deployment target.",
    "- [ ] The greenfield bootstrap lands on a materially different real stack than the recorded recommendation.",
    ""
  ].join("\n");
}

module.exports = {
  PROJECT_STACK_SOURCES,
  STACK_PROFILES,
  classifyDetectionConfidence,
  detectedProjectToStack,
  formatProjectStackLabel,
  isExplicitProjectStackSource,
  isStaleProjectStackSource,
  languageForProjectType,
  normalizeProjectStack,
  projectStackComponentsWithSkills,
  projectStackFromDetectedComponents,
  projectStackFromDetectedContext,
  projectStackFromProfile,
  projectDescriptorFromStack,
  projectStackKeywords,
  projectStackSkillIds,
  readStoredProjectStack,
  renderStackDecisionSpec,
  recommendProjectStack,
  resolveProjectStack,
  shouldPreserveStoredProjectStack,
  skillIdsForComponent,
  suppressPrepkitRuntimeDetection,
  upsertProjectStackComponent
};
