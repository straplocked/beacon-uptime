import { describe, it, expect } from "vitest";

import {
  validateAssertion,
  validateAssertions,
  unsafeRegexReason,
  resolveJsonPath,
  evaluateAssertions,
  MAX_ASSERTIONS_PER_MONITOR,
  type Assertion,
} from "./assertions";

describe("unsafeRegexReason (regex-safety validation)", () => {
  it("accepts an ordinary safe pattern", () => {
    expect(unsafeRegexReason("^ok$")).toBeNull();
    expect(unsafeRegexReason("error|failure")).toBeNull();
  });

  it("rejects empty patterns", () => {
    expect(unsafeRegexReason("")).toMatch(/empty/);
  });

  it("rejects patterns over the max length", () => {
    const long = "a".repeat(201);
    expect(unsafeRegexReason(long)).toMatch(/length/);
  });

  it("rejects the classic nested-quantifier ReDoS shapes", () => {
    expect(unsafeRegexReason("(a+)+$")).toMatch(/nested quantifiers/);
    expect(unsafeRegexReason("(a*)*")).toMatch(/nested quantifiers/);
    expect(unsafeRegexReason("(a+)*b")).toMatch(/nested quantifiers/);
    expect(unsafeRegexReason("(a*)+b")).toMatch(/nested quantifiers/);
  });

  it("rejects quantified alternation with overlapping branches", () => {
    expect(unsafeRegexReason("(a|a)+")).toMatch(/alternation/);
    expect(unsafeRegexReason("(x|xy)+z")).toMatch(/alternation/);
  });

  it("rejects patterns with too many quantifiers", () => {
    const manyQuantifiers = Array.from({ length: 11 }, () => "a+").join("");
    expect(unsafeRegexReason(manyQuantifiers)).toMatch(/too many quantifiers/);
  });

  it("rejects syntactically invalid regex", () => {
    expect(unsafeRegexReason("(unclosed")).toMatch(/invalid regex/);
  });
});

describe("validateAssertion", () => {
  it("accepts a valid body_contains assertion", () => {
    expect(() =>
      validateAssertion({ type: "body_contains", value: "ok" })
    ).not.toThrow();
  });

  it("rejects body_contains with an empty value", () => {
    expect(() =>
      validateAssertion({ type: "body_contains", value: "" })
    ).toThrow(/non-empty/);
  });

  it("rejects body_not_contains with an empty value", () => {
    expect(() =>
      validateAssertion({ type: "body_not_contains", value: "" })
    ).toThrow(/non-empty/);
  });

  it("rejects an unsafe body_regex pattern at validation time", () => {
    expect(() =>
      validateAssertion({ type: "body_regex", pattern: "(a+)+$" })
    ).toThrow(/nested quantifiers/);
  });

  it("accepts a safe body_regex pattern", () => {
    expect(() =>
      validateAssertion({ type: "body_regex", pattern: "^\\{.*\\}$" })
    ).not.toThrow();
  });

  it("rejects header_equals missing a header name", () => {
    expect(() =>
      validateAssertion({ type: "header_equals", header: "", value: "x" })
    ).toThrow(/header/);
  });

  it("rejects json_path_equals missing a path", () => {
    expect(() =>
      validateAssertion({ type: "json_path_equals", path: "", value: "x" })
    ).toThrow(/path/);
  });

  it("rejects an unknown assertion type", () => {
    expect(() =>
      validateAssertion({ type: "nonsense" } as unknown as Assertion)
    ).toThrow(/Unknown assertion type/);
  });
});

describe("validateAssertions (batch)", () => {
  it("rejects more than the per-monitor max", () => {
    const many: Assertion[] = Array.from(
      { length: MAX_ASSERTIONS_PER_MONITOR + 1 },
      () => ({ type: "body_contains", value: "ok" })
    );
    expect(() => validateAssertions(many)).toThrow(/Too many assertions/);
  });

  it("accepts exactly the max", () => {
    const max: Assertion[] = Array.from(
      { length: MAX_ASSERTIONS_PER_MONITOR },
      () => ({ type: "body_contains", value: "ok" })
    );
    expect(() => validateAssertions(max)).not.toThrow();
  });
});

describe("resolveJsonPath", () => {
  const data = {
    status: "ok",
    nested: { a: { b: 42 } },
    list: [{ id: 1 }, { id: 2 }],
  };

  it("resolves a top-level dot path", () => {
    expect(resolveJsonPath(data, "status")).toBe("ok");
    expect(resolveJsonPath(data, ".status")).toBe("ok");
  });

  it("resolves a nested dot path", () => {
    expect(resolveJsonPath(data, "nested.a.b")).toBe(42);
  });

  it("resolves bracket array indices", () => {
    expect(resolveJsonPath(data, "list[0].id")).toBe(1);
    expect(resolveJsonPath(data, "list[1].id")).toBe(2);
  });

  it("returns undefined for a missing path", () => {
    expect(resolveJsonPath(data, "nested.missing.deeper")).toBeUndefined();
    expect(resolveJsonPath(data, "nope")).toBeUndefined();
  });
});

describe("evaluateAssertions", () => {
  it("passes when body_contains matches", () => {
    const result = evaluateAssertions(
      [{ type: "body_contains", value: "healthy" }],
      { body: "status: healthy", headers: {} }
    );
    expect(result).toBeNull();
  });

  it("fails when body_contains does not match", () => {
    const result = evaluateAssertions(
      [{ type: "body_contains", value: "healthy" }],
      { body: "status: down", headers: {} }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/does not contain/);
  });

  it("fails when body_not_contains matches (forbidden text present)", () => {
    const result = evaluateAssertions(
      [{ type: "body_not_contains", value: "error" }],
      { body: "internal error occurred", headers: {} }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/forbidden text/);
  });

  it("passes body_regex when the pattern matches", () => {
    const result = evaluateAssertions(
      [{ type: "body_regex", pattern: "^\\{\\s*\"ok\"\\s*:\\s*true" }],
      { body: '{"ok": true, "extra": 1}', headers: {} }
    );
    expect(result).toBeNull();
  });

  it("fails body_regex when the pattern does not match", () => {
    const result = evaluateAssertions(
      [{ type: "body_regex", pattern: "^ready$" }],
      { body: "not ready", headers: {} }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/does not match/);
  });

  it("refuses to execute an unsafe body_regex even if it slipped through storage", () => {
    const result = evaluateAssertions(
      [{ type: "body_regex", pattern: "(a+)+$" }],
      { body: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!", headers: {} }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/rejected at check time/);
  });

  it("passes header_equals on a case-insensitive header match", () => {
    const result = evaluateAssertions(
      [{ type: "header_equals", header: "Content-Type", value: "application/json" }],
      { body: "{}", headers: { "content-type": "application/json" } }
    );
    expect(result).toBeNull();
  });

  it("fails header_equals when the header is missing", () => {
    const result = evaluateAssertions(
      [{ type: "header_equals", header: "X-Custom", value: "yes" }],
      { body: "", headers: {} }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/missing/);
  });

  it("fails header_equals when the value differs", () => {
    const result = evaluateAssertions(
      [{ type: "header_equals", header: "X-Custom", value: "yes" }],
      { body: "", headers: { "x-custom": "no" } }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toContain('"no"');
  });

  it("passes json_path_equals on a matching nested value", () => {
    const result = evaluateAssertions(
      [{ type: "json_path_equals", path: "data.status", value: "ok" }],
      {
        body: '{"data":{"status":"ok"}}',
        headers: {},
        jsonBody: { ok: true, value: { data: { status: "ok" } } },
      }
    );
    expect(result).toBeNull();
  });

  it("fails json_path_equals when the resolved value differs", () => {
    const result = evaluateAssertions(
      [{ type: "json_path_equals", path: "data.status", value: "ok" }],
      {
        body: '{"data":{"status":"degraded"}}',
        headers: {},
        jsonBody: { ok: true, value: { data: { status: "degraded" } } },
      }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toContain('"degraded"');
  });

  it("fails json_path_equals with a clear message on malformed JSON", () => {
    const result = evaluateAssertions(
      [{ type: "json_path_equals", path: "data.status", value: "ok" }],
      {
        body: "{not valid json",
        headers: {},
        jsonBody: { ok: false, error: "Unexpected token" },
      }
    );
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/not valid JSON/);
  });

  it("fails json_path_equals when jsonBody was never computed", () => {
    const result = evaluateAssertions(
      [{ type: "json_path_equals", path: "data.status", value: "ok" }],
      { body: "{}", headers: {} }
    );
    expect(result).not.toBeNull();
  });

  it("short-circuits on the first failing assertion, in order", () => {
    const result = evaluateAssertions(
      [
        { type: "body_contains", value: "missing-one" },
        { type: "body_contains", value: "missing-two" },
      ],
      { body: "nothing matches", headers: {} }
    );
    expect(result?.message).toMatch(/missing-one/);
  });

  it("passes with an empty assertions list", () => {
    expect(evaluateAssertions([], { body: "", headers: {} })).toBeNull();
  });
});
