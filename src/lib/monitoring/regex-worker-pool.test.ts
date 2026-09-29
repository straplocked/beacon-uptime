import { describe, it, expect, afterAll } from "vitest";

import { runRegexWithTimeout, shutdownRegexWorkerPool } from "./regex-worker-pool";

// A classic catastrophic-backtracking ("evil regex") pattern: a quantified
// optional group followed by a literal that never appears. It does NOT
// match the shapes `unsafeRegexReason()` in assertions.ts statically rejects
// (no nested `+`/`*`, no quantified alternation, only one quantifier), so it
// is exactly the kind of pattern the worker-thread hard timeout exists to
// catch once it slips past that heuristic. A single-threaded `.test()` call
// with this pattern/input pair does not return within 10s on this machine.
const CATASTROPHIC_PATTERN = "(a?){25}b";
const CATASTROPHIC_INPUT = "a".repeat(25);

describe("runRegexWithTimeout", () => {
  afterAll(async () => {
    await shutdownRegexWorkerPool();
  });

  it("matches an ordinary safe pattern", async () => {
    const result = await runRegexWithTimeout("^ok$", "ok", 1000);
    expect(result).toEqual({ matched: true, timedOut: false, error: undefined });
  });

  it("reports no match for an ordinary safe pattern that doesn't match", async () => {
    const result = await runRegexWithTimeout("^ok$", "not ok", 1000);
    expect(result.matched).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it("reports an invalid pattern as an error, not a crash", async () => {
    const result = await runRegexWithTimeout("(unclosed", "anything", 1000);
    expect(result.timedOut).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("times out a catastrophic pattern instead of hanging", async () => {
    const start = Date.now();
    const result = await runRegexWithTimeout(
      CATASTROPHIC_PATTERN,
      CATASTROPHIC_INPUT,
      150,
    );
    const elapsed = Date.now() - start;

    expect(result.timedOut).toBe(true);
    expect(result.matched).toBe(false);
    // The whole point: this resolves close to the timeout, not after the
    // pattern would eventually finish backtracking (seconds+).
    expect(elapsed).toBeLessThan(2000);
  }, 10000);

  it("keeps serving requests after a timeout replaces the stuck worker", async () => {
    // Run the pool size (default 2) worth of catastrophic jobs so every
    // worker gets replaced, then confirm the pool is still usable.
    await Promise.all([
      runRegexWithTimeout(CATASTROPHIC_PATTERN, CATASTROPHIC_INPUT, 100),
      runRegexWithTimeout(CATASTROPHIC_PATTERN, CATASTROPHIC_INPUT, 100),
    ]);

    const result = await runRegexWithTimeout("^ready$", "ready", 1000);
    expect(result).toEqual({ matched: true, timedOut: false, error: undefined });
  }, 10000);

  it("reuses the same pool across calls rather than spawning per job", async () => {
    // Fire more jobs than the default pool size concurrently; if a worker
    // were spawned per job this would still "work" functionally, so this
    // test is mostly documentation-by-assertion that a shared, bounded
    // pool handles queuing rather than the pool size ever needing to grow.
    const jobs = Array.from({ length: 8 }, (_, i) =>
      runRegexWithTimeout("^n(\\d+)$", `n${i}`, 1000),
    );
    const results = await Promise.all(jobs);
    expect(results.every((r) => r.matched && !r.timedOut)).toBe(true);
  });
});
