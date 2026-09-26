// Compiles the worker/scheduler entrypoints and the migration script to
// plain CommonJS in dist/, resolving the "@/*" -> "./src/*" path alias
// along the way (tsc alone can't do that without a runtime resolver).
//
// Anything reachable from these entrypoints is bundled (including the
// evaluator.ts module the worker/scheduler pull in via a lazy
// `await import()`), except real npm packages, which stay external and
// are resolved from node_modules at runtime — the Docker runtime image
// already ships node_modules alongside dist/.
import { build } from "esbuild";

await build({
  entryPoints: [
    { in: "src/worker/index.ts", out: "worker/index" },
    { in: "src/worker/scheduler.ts", out: "worker/scheduler" },
    { in: "scripts/migrate.ts", out: "scripts/migrate" },
  ],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  tsconfig: "tsconfig.worker.json",
  sourcemap: false,
  logLevel: "info",
});
