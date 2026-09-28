import { describe, it, expect } from "vitest";

import { DEFAULT_RETENTION_DAYS, getRetentionDays } from "./retention";

/* ────────────────────────────────────────────────────────────────
 * Vikunja 766 — the TimescaleDB retention policy in scripts/migrate.ts
 * used to hardcode 30 days regardless of DATA_RETENTION_DAYS. The fix
 * is to derive the policy's interval from the exact same parsing the
 * scheduler's cleanup job already used, via this shared helper. These
 * tests pin that parsing so scheduler and migrate can never drift
 * apart again.
 * ──────────────────────────────────────────────────────────────── */

describe("DEFAULT_RETENTION_DAYS", () => {
  it("is 365 days", () => {
    expect(DEFAULT_RETENTION_DAYS).not.toBe(30);
    expect(DEFAULT_RETENTION_DAYS).toBe(365);
  });
});

describe("getRetentionDays", () => {
  it("falls back to the default when DATA_RETENTION_DAYS is unset", () => {
    expect(getRetentionDays({})).toBe(365);
  });

  it("falls back to the default when DATA_RETENTION_DAYS is empty", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "" })).toBe(365);
  });

  it("parses a positive integer", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "90" })).toBe(90);
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "1" })).toBe(1);
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "3650" })).toBe(3650);
  });

  it("truncates a fractional string via parseInt", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "90.9" })).toBe(90);
  });

  it("ignores leading/trailing whitespace the way parseInt does", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "  45  " })).toBe(45);
  });

  it("falls back to the default for zero", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "0" })).toBe(365);
  });

  it("falls back to the default for negative values", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "-30" })).toBe(365);
  });

  it("falls back to the default for non-numeric garbage", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "abc" })).toBe(365);
  });

  it("falls back to the default for Infinity-producing input", () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: "Infinity" })).toBe(365);
  });

  it("defaults to process.env when no env is passed", () => {
    const prev = process.env.DATA_RETENTION_DAYS;
    try {
      process.env.DATA_RETENTION_DAYS = "120";
      expect(getRetentionDays()).toBe(120);
    } finally {
      if (prev === undefined) delete process.env.DATA_RETENTION_DAYS;
      else process.env.DATA_RETENTION_DAYS = prev;
    }
  });
});
