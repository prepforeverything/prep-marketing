import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const resolver = require("./effective-runtime-config.cjs");

export const resolveEffectiveRuntimeConfig = resolver.resolveEffectiveRuntimeConfig;
