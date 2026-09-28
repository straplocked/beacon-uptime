/**
 * HTTP keyword / body / header / JSON-path assertions (E4).
 *
 * Evaluated in `src/lib/monitoring/checks/http.ts` after the response comes
 * back. A failing assertion makes the check fail (`down`) with the failing
 * assertion's description recorded as the check's `errorMessage` so check
 * history shows *why* — see docs/API.md and docs/MCP.md.
 *
 * This module is imported from `src/lib/db/schema.ts`, which is shared by
 * both `tsconfig.json` (Next.js) and `tsconfig.worker.json` (the worker), so
 * it must not import React/Next or anything DOM-only.
 *
 * ─── Regex safety ──────────────────────────────────────────────────────
 * `body_regex` assertions run user-supplied patterns against attacker-
 * influenced response bodies, so a naive `new RegExp(pattern).test(body)`
 * is a ReDoS vector (catastrophic backtracking). Three independent guards:
 *
 *   1. Pattern length is capped (`MAX_REGEX_PATTERN_LENGTH`) — long patterns
 *      are both unnecessary for a keyword check and the raw material for
 *      exponential-blowup constructions.
 *   2. The scanned body is capped to `MAX_REGEX_SCAN_BYTES` (1 MB) — bounds
 *      the input size the pattern can backtrack over.
 *   3. `assertPatternIsSafe()` statically rejects the classic catastrophic
 *      shapes at validation time (nested quantifiers like `(a+)+`, `(a*)*`,
 *      and quantified alternation like `(a|a)+`) before the pattern is ever
 *      compiled against a real body. This is a heuristic, not a proof of
 *      linear-time execution for every possible pattern — it does not
 *      require a new regex-engine dependency (e.g. RE2) or a worker-thread
 *      sandbox, which was judged out of scope for this batch. Combined with
 *      the length/size caps above, it closes the realistic exploit shapes.
 */

export type Assertion =
  | { type: "body_contains"; value: string }
  | { type: "body_not_contains"; value: string }
  | { type: "body_regex"; pattern: string }
  | { type: "header_equals"; header: string; value: string }
  | { type: "json_path_equals"; path: string; value: string };

export const MAX_REGEX_PATTERN_LENGTH = 200;
export const MAX_REGEX_SCAN_BYTES = 1_000_000; // 1 MB
export const MAX_ASSERTIONS_PER_MONITOR = 20;

export interface AssertionFailure {
  assertion: Assertion;
  message: string;
}

/**
 * Heuristically reject regex patterns shaped like classic catastrophic-
 * backtracking constructions. Returns an error string if unsafe, or null
 * if the pattern passes.
 */
export function unsafeRegexReason(pattern: string): string | null {
  if (pattern.length === 0) return "pattern must not be empty";
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return `pattern exceeds max length of ${MAX_REGEX_PATTERN_LENGTH} characters`;
  }

  // Nested quantifiers: a quantified group that is itself quantified,
  // e.g. (a+)+, (a*)*, (a+)*, (a*)+, (a{2,})+ — the textbook ReDoS shape.
  const nestedQuantifier = /\([^()]*[+*][^()]*\)[+*?]/;
  if (nestedQuantifier.test(pattern)) {
    return "nested quantifiers (e.g. (a+)+) are not allowed — catastrophic backtracking risk";
  }

  // Quantified alternation with overlapping branches, e.g. (a|a)+, (a|ab)+.
  const quantifiedAlternation = /\([^()]*\|[^()]*\)[+*]/;
  if (quantifiedAlternation.test(pattern)) {
    return "quantified alternation groups (e.g. (a|a)+) are not allowed — catastrophic backtracking risk";
  }

  // Cap the number of quantifiers overall — even without nesting, a large
  // number of adjacent quantified groups can still blow up combinatorially.
  const quantifierCount = (pattern.match(/[+*]|\{\d+,?\d*\}/g) ?? []).length;
  if (quantifierCount > 10) {
    return "too many quantifiers in one pattern (max 10)";
  }

  try {
    new RegExp(pattern);
  } catch (err) {
    return `invalid regex: ${err instanceof Error ? err.message : String(err)}`;
  }

  return null;
}

/** Validate a single assertion at creation/update time. Throws on invalid input. */
export function validateAssertion(assertion: Assertion): void {
  switch (assertion.type) {
    case "body_contains":
    case "body_not_contains":
      if (!assertion.value || assertion.value.length === 0) {
        throw new Error(`${assertion.type} requires a non-empty "value"`);
      }
      if (assertion.value.length > 1000) {
        throw new Error(`${assertion.type} "value" is too long (max 1000 chars)`);
      }
      break;
    case "body_regex": {
      const reason = unsafeRegexReason(assertion.pattern ?? "");
      if (reason) throw new Error(`body_regex: ${reason}`);
      break;
    }
    case "header_equals":
      if (!assertion.header || assertion.header.length === 0) {
        throw new Error("header_equals requires a non-empty \"header\"");
      }
      if (assertion.value === undefined || assertion.value === null) {
        throw new Error("header_equals requires a \"value\"");
      }
      break;
    case "json_path_equals":
      if (!assertion.path || assertion.path.length === 0) {
        throw new Error("json_path_equals requires a non-empty \"path\"");
      }
      if (assertion.value === undefined || assertion.value === null) {
        throw new Error("json_path_equals requires a \"value\"");
      }
      break;
    default:
      throw new Error(`Unknown assertion type: ${JSON.stringify(assertion)}`);
  }
}

export function validateAssertions(assertions: Assertion[]): void {
  if (assertions.length > MAX_ASSERTIONS_PER_MONITOR) {
    throw new Error(
      `Too many assertions (max ${MAX_ASSERTIONS_PER_MONITOR} per monitor)`,
    );
  }
  for (const a of assertions) validateAssertion(a);
}

/**
 * Resolve a simple dot/bracket JSON path against a parsed JSON value.
 * Supports `.foo`, `.foo.bar`, `foo[0]`, `foo.bar[2].baz`. No eval, no
 * expressions — pure property/index walk.
 */
export function resolveJsonPath(data: unknown, path: string): unknown {
  // Normalize `a[0].b` -> `a.0.b`, strip a leading '$' or '.' if present.
  const normalized = path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");
  if (normalized === "") return data;
  const segments = normalized.split(".").filter((s) => s.length > 0);

  let current: unknown = data;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

function stringifyForCompare(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Evaluate all assertions against a completed HTTP response. Returns the
 * first failure (assertions are evaluated in order, short-circuiting) or
 * null if all pass. `body` should already be capped by the caller if huge;
 * this function additionally caps what it scans for `body_regex`.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  ctx: {
    body: string;
    headers: Record<string, string>;
    jsonBody?: { ok: true; value: unknown } | { ok: false; error: string };
  },
): AssertionFailure | null {
  for (const assertion of assertions) {
    switch (assertion.type) {
      case "body_contains": {
        if (!ctx.body.includes(assertion.value)) {
          return {
            assertion,
            message: `body does not contain "${truncate(assertion.value)}"`,
          };
        }
        break;
      }
      case "body_not_contains": {
        if (ctx.body.includes(assertion.value)) {
          return {
            assertion,
            message: `body contains forbidden text "${truncate(assertion.value)}"`,
          };
        }
        break;
      }
      case "body_regex": {
        const reason = unsafeRegexReason(assertion.pattern);
        if (reason) {
          // Should have been rejected at validation time, but never trust
          // stored data blindly — refuse to execute it now either.
          return {
            assertion,
            message: `body_regex pattern rejected at check time: ${reason}`,
          };
        }
        const scanTarget = ctx.body.slice(0, MAX_REGEX_SCAN_BYTES);
        let matched = false;
        try {
          matched = new RegExp(assertion.pattern).test(scanTarget);
        } catch (err) {
          return {
            assertion,
            message: `body_regex failed to run: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        if (!matched) {
          return {
            assertion,
            message: `body does not match /${truncate(assertion.pattern)}/`,
          };
        }
        break;
      }
      case "header_equals": {
        const actual = ctx.headers[assertion.header.toLowerCase()];
        if (actual !== assertion.value) {
          return {
            assertion,
            message: `header "${assertion.header}" was ${
              actual === undefined ? "missing" : `"${truncate(actual)}"`
            }, expected "${truncate(assertion.value)}"`,
          };
        }
        break;
      }
      case "json_path_equals": {
        if (!ctx.jsonBody || !ctx.jsonBody.ok) {
          return {
            assertion,
            message: `json_path_equals "${assertion.path}": body is not valid JSON${
              ctx.jsonBody && !ctx.jsonBody.ok ? ` (${ctx.jsonBody.error})` : ""
            }`,
          };
        }
        const resolved = resolveJsonPath(ctx.jsonBody.value, assertion.path);
        const actualStr = stringifyForCompare(resolved);
        if (actualStr !== assertion.value) {
          return {
            assertion,
            message: `json path "${assertion.path}" was ${
              resolved === undefined ? "missing" : `"${truncate(actualStr)}"`
            }, expected "${truncate(assertion.value)}"`,
          };
        }
        break;
      }
    }
  }
  return null;
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
