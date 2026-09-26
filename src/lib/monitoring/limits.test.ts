import { describe, it, expect } from "vitest";

import { MIN_CHECK_INTERVAL_SECONDS, clampCheckInterval } from "./limits";

/* ────────────────────────────────────────────────────────────────
 * NAMED GUARD — the 30s check-interval floor survives de-gating.
 *
 * This floor used to arrive via `getMinCheckInterval(plan)`, which
 * returned a flat 30 in the OSS edition. Plan gating is gone, but the
 * floor is a real operational limit (the scheduler ticks every 15s), so
 * it must still be enforced by every monitor-create/update path.
 *
 * All expected values below are hand-written, never derived from
 * MIN_CHECK_INTERVAL_SECONDS itself.
 * ──────────────────────────────────────────────────────────────── */

describe("MIN_CHECK_INTERVAL_SECONDS", () => {
  it("is 30 seconds", () => {
    // Assert the wrong answer first so a silently-lowered floor cannot pass.
    expect(MIN_CHECK_INTERVAL_SECONDS).not.toBe(1);
    expect(MIN_CHECK_INTERVAL_SECONDS).not.toBe(15);
    expect(MIN_CHECK_INTERVAL_SECONDS).toBe(30);
  });
});

describe("clampCheckInterval", () => {
  it("raises sub-floor intervals to 30s", () => {
    expect(clampCheckInterval(1)).toBe(30);
    expect(clampCheckInterval(5)).toBe(30);
    expect(clampCheckInterval(29)).toBe(30);
  });

  it("leaves the floor itself untouched", () => {
    expect(clampCheckInterval(30)).toBe(30);
  });

  it("leaves intervals above the floor untouched", () => {
    expect(clampCheckInterval(31)).toBe(31);
    expect(clampCheckInterval(60)).toBe(60);
    expect(clampCheckInterval(300)).toBe(300);
    expect(clampCheckInterval(86400)).toBe(86400);
  });

  it("clamps zero and negative requests to the floor", () => {
    expect(clampCheckInterval(0)).toBe(30);
    expect(clampCheckInterval(-120)).toBe(30);
  });
});
