export interface HttpCheckOptions {
  target: string;
  method: "GET" | "POST" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
  headers?: Record<string, string>;
  body?: string;
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
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = performance.now();

  try {
    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": "Beacon-Monitor/1.0",
        ...headers,
      },
      redirect: "follow",
    };

    if (body && method === "POST") {
      fetchOptions.body = body;
    }

    const response = await fetch(target, fetchOptions);
    const responseTimeMs = Math.round(performance.now() - start);

    clearTimeout(timeout);

    // Extract TLS expiry if available (Node.js specific)
    let tlsExpiry: Date | null = null;

    const statusCode = response.status;
    const isExpectedStatus = statusCode === expectedStatusCode;

    // Determine status
    let status: "up" | "down" | "degraded";
    if (!isExpectedStatus) {
      status = "down";
    } else if (responseTimeMs > timeoutMs * 0.8) {
      // If response time is >80% of timeout, mark as degraded
      status = "degraded";
    } else {
      status = "up";
    }

    return {
      status,
      responseTimeMs,
      statusCode,
      errorMessage: isExpectedStatus
        ? null
        : `Expected status ${expectedStatusCode}, got ${statusCode}`,
      tlsExpiry,
    };
  } catch (error) {
    clearTimeout(timeout);
    const responseTimeMs = Math.round(performance.now() - start);

    let errorMessage = "Unknown error";
    if (error instanceof Error) {
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
