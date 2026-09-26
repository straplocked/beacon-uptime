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
    // Compiled worker/scheduler/migrate bundle (npm run build:worker) — a
    // generated build artifact, not source.
    "dist/**",
  ]),
  {
    // Test files mock third-party network APIs (tls.connect, net.Socket,
    // dns callbacks, etc.) whose real overload signatures are awkward or
    // impossible to satisfy exactly from a vi.fn() mock. `any` here is the
    // mock boundary, not a shortcut around real application types — see
    // Vikunja C5.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
