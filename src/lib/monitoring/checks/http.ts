import {
  evaluateAssertions,
  MAX_REGEX_SCAN_BYTES,
  type Assertion,
} from "@/lib/monitoring/assertions";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { allowPrivateTargets } from "@/lib/net/target-policy";

export interface HttpCheckOptions {
  target: string;
  method: "GET" | "POST" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
  headers?: Record<string, string>;
  body?: string;
  assertions?: Assertion[];
}

export interface CheckResult {
  status: "up" | "down" | "degraded";
  responseTimeMs: number;
  statusCode: number | null;
  errorMessage: string | null;
  tlsExpiry: Date | null;
}

export async function performHttpCheck(
  options: HttpCheckOptions
): Promise<CheckResult> {
  const {
    target,
    method,
    timeoutMs,
    expectedStatusCode,
    headers,
    body,
    assertions,
  } = options;

  const start = performance.now();

  // ALLOW_PRIVATE_TARGETS=false routes the check through safeFetch, which
  // resolves the target (and re-validates every redirect hop) and refuses
  // private/loopback/reserved addresses — see src/lib/net/target-policy.ts.
  // That guard manages its own timeout internally, so only the default,
  // unguarded path needs its own AbortController.
  const useSafeFetch = !allowPrivateTargets();
  const controller = useSafeFetch ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    let response: Response;

    if (useSafeFetch) {
      const safe = await safeFetch(target, {
        method,
        headers: { "User-Agent": "Beacon-Monitor/1.0", ...headers },
        body: body && method === "POST" ? body : undefined,
        timeoutMs,
        allowedContentTypes: [], // monitor checks may assert against any content type
      });
      // Response's DOM-lib BodyInit type doesn't structurally accept a
      // Node Buffer under this project's Next.js tsconfig (it does under
      // the worker's own, DOM-less one) — an explicit Uint8Array view
      // satisfies both.
      response = new Response(new Uint8Array(safe.body), {
        status: safe.status,
        headers: safe.headers,
      });
    } else {
      const fetchOptions: RequestInit = {
        method,
        signal: controller!.signal,
        headers: {
          "User-Agent": "Beacon-Monitor/1.0",
          ...headers,
        },
        redirect: "follow",
      };

      if (body && method === "POST") {
        fetchOptions.body = body;
      }

      response = await fetch(target, fetchOptions);
    }

    const responseTimeMs = Math.round(performance.now() - start);

    if (timeout) clearTimeout(timeout);

    // Extract TLS expiry if available (Node.js specific)
    const tlsExpiry: Date | null = null;

    const statusCode = response.status;
    const isExpectedStatus = statusCode === expectedStatusCode;

    // Determine status
    let status: "up" | "down" | "degraded";
    let errorMessage: string | null;

    if (!isExpectedStatus) {
      status = "down";
      errorMessage = `Expected status ${expectedStatusCode}, got ${statusCode}`;
    } else if (assertions && assertions.length > 0) {
      // Only evaluate content assertions once the status code itself is
      // already the expected one — a wrong status code is its own,
      // clearer failure reason, and there's no point regex-scanning a
      // body we already know is a failed check.
      const assertionFailure = await evaluateHttpAssertions(response, assertions);
      if (assertionFailure) {
        status = "down";
        errorMessage = `Assertion failed: ${assertionFailure.message}`;
      } else if (responseTimeMs > timeoutMs * 0.8) {
        status = "degraded";
        errorMessage = null;
      } else {
        status = "up";
        errorMessage = null;
      }
    } else if (responseTimeMs > timeoutMs * 0.8) {
      // If response time is >80% of timeout, mark as degraded
      status = "degraded";
      errorMessage = null;
    } else {
      status = "up";
      errorMessage = null;
    }

    return {
      status,
      responseTimeMs,
      statusCode,
      errorMessage,
      tlsExpiry,
    };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    const responseTimeMs = Math.round(performance.now() - start);

    let errorMessage = "Unknown error";
    if (error instanceof SafeFetchError) {
      errorMessage =
        error.code === "timeout"
          ? `Request timeout after ${timeoutMs}ms`
          : error.message;
    } else if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = `Request timeout after ${timeoutMs}ms`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      status: "down",
      responseTimeMs,
      statusCode: null,
      errorMessage,
      tlsExpiry: null,
    };
  }
}

/**
 * Read the response body/headers and run the monitor's configured
 * assertions against them (see src/lib/monitoring/assertions.ts for the
 * per-type evaluation and the regex-safety guards).
 *
 * Note: this reads the full response body via `response.text()` — it does
 * not stream-cap the number of bytes pulled off the socket, only how much
 * of the resulting string is *scanned* (see `MAX_REGEX_SCAN_BYTES` in
 * assertions.ts). A target that returns an enormous body could still cost
 * memory/time to fully receive; that's accepted here as out of scope for
 * this batch (bounded in practice by `timeoutMs`, max 60s), same as the
 * rest of the check pipeline pre-dating assertions.
 */
async function evaluateHttpAssertions(
  response: Response,
  assertions: Assertion[]
) {
  const bodyText = await response.text();
  const scannedBody = bodyText.slice(0, MAX_REGEX_SCAN_BYTES);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const needsJson = assertions.some((a) => a.type === "json_path_equals");
  let jsonBody: { ok: true; value: unknown } | { ok: false; error: string } | undefined;
  if (needsJson) {
    try {
      jsonBody = { ok: true, value: JSON.parse(bodyText) };
    } catch (err) {
      jsonBody = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return await evaluateAssertions(assertions, {
    body: scannedBody,
    headers,
    jsonBody,
  });
}
