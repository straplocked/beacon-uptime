import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not covered by the defaults once globalIgnores replaces them, and a
    // stale worktree under .claude/ otherwise gets linted as a second copy
    // of the whole repo (222 of 232 problem files before this was added).
    "node_modules/**",
    ".claude/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
