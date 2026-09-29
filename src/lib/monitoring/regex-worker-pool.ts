/**
 * Runs a single regex `.test()` call inside a pooled `worker_threads` Worker
 * with a hard wall-clock timeout (Vikunja 803).
 *
 * `unsafeRegexReason()` in assertions.ts heuristically rejects the classic
 * catastrophic-backtracking *shapes* (nested quantifiers, quantified
 * alternation) before a pattern is ever run, but — as its own docstring
 * says — that's a heuristic, not a proof of linear-time execution for every
 * possible pattern/input pair. This module is the real backstop: the regex
 * actually runs on a separate thread, so if it backtracks catastrophically
 * it hangs *that thread's* event loop, not the worker process handling
 * every other monitor check. A hard `setTimeout` on the caller side
 * terminates the stuck worker and reports a clean timeout instead of the
 * whole check pipeline stalling.
 *
 * The worker's source is a small, self-contained JS string run with
 * `{ eval: true }` rather than a separate compiled file. That sidesteps two
 * real problems with a file-based worker here: `src/lib/**` is typechecked
 * under both `tsconfig.json` (Next.js/webpack) and `tsconfig.worker.json`
 * (esbuild, see scripts/build-worker.mjs) and only the latter is ever
 * actually bundled for the worker process, so a `.ts` worker-thread file
 * would need its own esbuild entry point and a runtime path that resolves
 * correctly under both `tsx` (dev) and the bundled `dist/` layout (prod) —
 * annoying to get right for ~10 lines of logic. An eval'd string needs no
 * separate file and behaves identically in both.
 *
 * The pool is a module-level singleton — callers must not spawn a worker
 * per check (Chris's explicit ask), since that would add real per-check
 * startup latency and quickly exhaust threads under concurrent checks.
 */

import { Worker } from "worker_threads";

const DEFAULT_POOL_SIZE = 2;

/** Runs in the worker thread. Deliberately plain JS — see module docstring. */
const WORKER_SOURCE = `
const { parentPort } = require("worker_threads");
parentPort.on("message", (msg) => {
  const { id, pattern, input } = msg;
  try {
    const re = new RegExp(pattern);
    parentPort.postMessage({ id, ok: true, matched: re.test(input) });
  } catch (err) {
    parentPort.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});
`;

export interface RegexJobResult {
  matched: boolean;
  timedOut: boolean;
  error?: string;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

interface QueuedJob {
  pattern: string;
  input: string;
  timeoutMs: number;
  resolve: (result: RegexJobResult) => void;
}

interface PendingJob {
  id: number;
  resolve: (result: RegexJobResult) => void;
  timer: NodeJS.Timeout;
}

const poolWorkers: PoolWorker[] = [];
let nextJobId = 0;
const pendingByWorker = new Map<Worker, PendingJob>();
const queue: QueuedJob[] = [];

function poolSize(): number {
  const n = Number(process.env.REGEX_WORKER_POOL_SIZE);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_POOL_SIZE;
}

function spawnWorker(): PoolWorker {
  const worker = new Worker(WORKER_SOURCE, { eval: true });
  // Idle pool workers must not keep the process (or a vitest run) alive.
  worker.unref();
  const pw: PoolWorker = { worker, busy: false };
  worker.on("message", (msg: { id: number; ok: boolean; matched?: boolean; error?: string }) =>
    handleMessage(pw, msg)
  );
  worker.on("error", (err) => handleWorkerError(pw, err));
  return pw;
}

function ensurePool(): void {
  const size = poolSize();
  while (poolWorkers.length < size) {
    poolWorkers.push(spawnWorker());
  }
}

function handleMessage(
  pw: PoolWorker,
  msg: { id: number; ok: boolean; matched?: boolean; error?: string }
): void {
  const pending = pendingByWorker.get(pw.worker);
  // A stale message from a job that already timed out on this worker —
  // the worker was already replaced, ignore it.
  if (!pending || pending.id !== msg.id) return;

  clearTimeout(pending.timer);
  pendingByWorker.delete(pw.worker);
  pw.busy = false;
  pending.resolve({
    matched: msg.ok ? Boolean(msg.matched) : false,
    timedOut: false,
    error: msg.ok ? undefined : msg.error,
  });
  dispatchNext();
}

function handleWorkerError(pw: PoolWorker, err: Error): void {
  const pending = pendingByWorker.get(pw.worker);
  if (pending) {
    clearTimeout(pending.timer);
    pendingByWorker.delete(pw.worker);
    pending.resolve({ matched: false, timedOut: false, error: err.message });
  }
  replaceWorker(pw);
}

function replaceWorker(pw: PoolWorker): void {
  const idx = poolWorkers.indexOf(pw);
  try {
    pw.worker.terminate();
  } catch {
    // already dead — fine.
  }
  const fresh = spawnWorker();
  if (idx !== -1) {
    poolWorkers[idx] = fresh;
  } else {
    poolWorkers.push(fresh);
  }
  dispatchNext();
}

function dispatchNext(): void {
  if (queue.length === 0) return;
  const free = poolWorkers.find((w) => !w.busy);
  if (!free) return;
  const job = queue.shift();
  if (job) runOnWorker(free, job);
}

function runOnWorker(pw: PoolWorker, job: QueuedJob): void {
  pw.busy = true;
  const id = nextJobId++;

  const timer = setTimeout(() => {
    // Hard timeout: the pattern is (likely) backtracking catastrophically.
    // The worker's event loop is blocked, so it won't ever get to process
    // .terminate() cooperatively — kill it outright and spin up a fresh
    // one so the pool stays at full size for the next check.
    pendingByWorker.delete(pw.worker);
    job.resolve({ matched: false, timedOut: true });
    replaceWorker(pw);
  }, job.timeoutMs);

  pendingByWorker.set(pw.worker, { id, resolve: job.resolve, timer });
  pw.worker.postMessage({ id, pattern: job.pattern, input: job.input });
}

/**
 * Test `pattern` against `input` on the shared worker pool. Never throws —
 * a compile/runtime error in the pattern comes back as `{ error }`, and a
 * pattern that doesn't finish within `timeoutMs` comes back as
 * `{ timedOut: true }`, matched `false`.
 */
export function runRegexWithTimeout(
  pattern: string,
  input: string,
  timeoutMs: number
): Promise<RegexJobResult> {
  ensurePool();
  return new Promise((resolve) => {
    const job: QueuedJob = { pattern, input, timeoutMs, resolve };
    const free = poolWorkers.find((w) => !w.busy);
    if (free) {
      runOnWorker(free, job);
    } else {
      queue.push(job);
    }
  });
}

/**
 * Terminates every pooled worker. Not used by production code (the pool is
 * meant to live for the process's lifetime) — for tests that need the
 * process/runner to exit cleanly without waiting on `.unref()`'d handles.
 */
export async function shutdownRegexWorkerPool(): Promise<void> {
  const workers = poolWorkers.splice(0, poolWorkers.length);
  queue.length = 0;
  await Promise.all(
    workers.map((pw) =>
      pw.worker.terminate().catch(() => {
        // already gone — fine.
      })
    )
  );
}
