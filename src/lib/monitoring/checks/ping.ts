import { execFile } from "child_process";
import { assertTargetAllowed } from "@/lib/net/target-policy";

/**
 * A ping target is a hostname or an IP literal, nothing else. The target is
 * user-supplied (API, MCP, dashboard), so it is validated and passed to ping
 * as an argv entry, never through a shell: `exec(`ping ... ${target}`)` let a
 * target like `1.1.1.1; <cmd>` run commands inside the container.
 */
const PING_TARGET = /^[A-Za-z0-9](?:[A-Za-z0-9.:-]{0,252})$/;

export function isValidPingTarget(target: string): boolean {
  return PING_TARGET.test(target);
}

export interface PingCheckOptions {
  target: string; // hostname or IP
  timeoutMs: number;
}

export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number;
  errorMessage: string | null;
}

export async function performPingCheck(
  options: PingCheckOptions
): Promise<CheckResult> {
  const { target, timeoutMs } = options;
  const timeoutSec = Math.ceil(timeoutMs / 1000);
  const start = performance.now();

  if (!isValidPingTarget(target)) {
    return {
      status: "down",
      responseTimeMs: 0,
      errorMessage: "Invalid ping target: use a hostname or IP address",
    };
  }

  try {
    await assertTargetAllowed(target);
  } catch (err) {
    return {
      status: "down",
      responseTimeMs: 0,
      errorMessage: err instanceof Error ? err.message : "Target not allowed",
    };
  }

  return new Promise<CheckResult>((resolve) => {
    // Use -c 1 for single ping, -W for timeout (Linux). argv, not a shell.
    const args = ["-c", "1", "-W", String(timeoutSec), target];

    execFile("ping", args, { timeout: timeoutMs + 2000 }, (error, stdout, stderr) => {
      const responseTimeMs = Math.round(performance.now() - start);

      if (error) {
        resolve({
          status: "down",
          responseTimeMs,
          errorMessage: stderr || error.message || "Ping failed",
        });
        return;
      }

      // Try to extract actual round-trip time from ping output
      const timeMatch = stdout.match(/time[=<]([\d.]+)\s*ms/);
      const actualTime = timeMatch
        ? Math.round(parseFloat(timeMatch[1]))
        : responseTimeMs;

      resolve({
        status: "up",
        responseTimeMs: actualTime,
        errorMessage: null,
      });
    });
  });
}
