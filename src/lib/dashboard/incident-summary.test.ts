import { describe, it, expect } from "vitest";
import { formatAgo, resolveAcknowledgedBy } from "./incident-summary";

describe("formatAgo", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("formats seconds", () => {
    expect(formatAgo(new Date("2026-01-01T11:59:45.000Z"), now)).toBe("15s");
  });

  it("formats minutes", () => {
    expect(formatAgo(new Date("2026-01-01T11:55:00.000Z"), now)).toBe("5 min");
  });

  it("formats hours", () => {
    expect(formatAgo(new Date("2026-01-01T09:00:00.000Z"), now)).toBe("3h");
  });

  it("formats days", () => {
    expect(formatAgo(new Date("2025-12-30T12:00:00.000Z"), now)).toBe("2d");
  });
});

describe("resolveAcknowledgedBy", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("returns undefined when the incident has no acknowledgedAt", () => {
    expect(resolveAcknowledgedBy(null, "Alice", now)).toBeUndefined();
    expect(resolveAcknowledgedBy(undefined, "Alice", now)).toBeUndefined();
  });

  it("returns the acknowledger's name and relative time when acknowledged", () => {
    const ackedAt = new Date("2026-01-01T11:50:00.000Z");
    expect(resolveAcknowledgedBy(ackedAt, "Alice", now)).toEqual({
      name: "Alice",
      ago: "10 min",
    });
  });

  it("falls back to a generic name when the acknowledger's name is unknown", () => {
    // This is the case the dashboard bug produced: acknowledgedAt was set
    // but the acknowledger's name was never joined in, so the banner must
    // still show *something* rather than silently reverting to
    // "Unacknowledged".
    const ackedAt = new Date("2026-01-01T11:50:00.000Z");
    expect(resolveAcknowledgedBy(ackedAt, null, now)).toEqual({
      name: "someone",
      ago: "10 min",
    });
  });
});
