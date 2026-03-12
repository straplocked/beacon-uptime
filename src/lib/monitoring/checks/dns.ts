import * as dns from "dns/promises";

export interface DnsCheckOptions {
  target: string; // hostname to resolve
  timeoutMs: number;
}

export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number;
  errorMessage: string | null;
}

export async function performDnsCheck(
  options: DnsCheckOptions
): Promise<CheckResult> {
  const { target, timeoutMs } = options;
  const start = performance.now();

  return new Promise<CheckResult>((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        status: "down",
        responseTimeMs: Math.round(performance.now() - start),
        errorMessage: `DNS resolution timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    dns
      .resolve(target)
      .then((addresses) => {
        clearTimeout(timeout);
        const responseTimeMs = Math.round(performance.now() - start);

        if (addresses.length === 0) {
          resolve({
            status: "down",
            responseTimeMs,
            errorMessage: "No DNS records found",
          });
        } else {
          resolve({
            status: "up",
            responseTimeMs,
            errorMessage: null,
          });
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        const responseTimeMs = Math.round(performance.now() - start);
        resolve({
          status: "down",
          responseTimeMs,
          errorMessage: err.message,
        });
      });
  });
}
