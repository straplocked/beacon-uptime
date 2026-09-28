import { describe, it, expect } from "vitest";

import {
  MIN_CHECK_INTERVAL_SECONDS,
  clampCheckInterval,
  MIN_CONFIRMATION_COUNT,
  MAX_CONFIRMATION_COUNT,
  DEFAULT_CONFIRMATION_COUNT,
  clampConfirmationCount,
  MIN_RETRY_INTERVAL_SECONDS,
  DEFAULT_RETRY_INTERVAL_SECONDS,
  clampRetryInterval,
} from "./limits";

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

/* ────────────────────────────────────────────────────────────────
 * E5 — retry / confirmation policy limits.
 * ──────────────────────────────────────────────────────────────── */

describe("confirmation count constants", () => {
  it("defaults to 2 for new monitors and floors at 1 (immediate)", () => {
    expect(MIN_CONFIRMATION_COUNT).toBe(1);
    expect(DEFAULT_CONFIRMATION_COUNT).toBe(2);
    expect(MAX_CONFIRMATION_COUNT).toBeGreaterThanOrEqual(DEFAULT_CONFIRMATION_COUNT);
  });
});

describe("clampConfirmationCount", () => {
  it("floors sub-1 requests to 1 (no confirmation / immediate)", () => {
    expect(clampConfirmationCount(0)).toBe(1);
    expect(clampConfirmationCount(-5)).toBe(1);
  });

  it("leaves in-range values untouched", () => {
    expect(clampConfirmationCount(1)).toBe(1);
    expect(clampConfirmationCount(2)).toBe(2);
    expect(clampConfirmationCount(5)).toBe(5);
  });

  it("caps above the ceiling", () => {
    expect(clampConfirmationCount(999)).toBe(MAX_CONFIRMATION_COUNT);
  });

  it("rounds fractional requests", () => {
    expect(clampConfirmationCount(2.4)).toBe(2);
    expect(clampConfirmationCount(2.6)).toBe(3);
  });
});

describe("clampRetryInterval", () => {
  it("defaults to 30s", () => {
    expect(DEFAULT_RETRY_INTERVAL_SECONDS).toBe(30);
  });

  it("floors sub-tick requests to the scheduler's own resolution (15s)", () => {
    expect(MIN_RETRY_INTERVAL_SECONDS).toBe(15);
    expect(clampRetryInterval(1, 60)).toBe(15);
    expect(clampRetryInterval(0, 60)).toBe(15);
  });

  it("leaves in-range requests untouched", () => {
    expect(clampRetryInterval(30, 60)).toBe(30);
    expect(clampRetryInterval(20, 60)).toBe(20);
  });

  it("caps a retry slower than the monitor's own interval down to the interval", () => {
    expect(clampRetryInterval(120, 60)).toBe(60);
  });

  it("never returns something below the tick floor even when the monitor interval is smaller", () => {
    expect(clampRetryInterval(5, 20)).toBe(15);
  });
});
