import { exec } from "child_process";

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

  return new Promise<CheckResult>((resolve) => {
    // Use -c 1 for single ping, -W for timeout (Linux)
    const command = `ping -c 1 -W ${timeoutSec} ${target}`;

    exec(command, { timeout: timeoutMs + 2000 }, (error, stdout, stderr) => {
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
