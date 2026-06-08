import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const resolver = require("./pack-resolver.cjs");

export const resolveSelectedPacks = resolver.resolveSelectedPacks;
