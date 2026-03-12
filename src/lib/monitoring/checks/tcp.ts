import * as net from "net";

export interface TcpCheckOptions {
  target: string; // host:port format
  timeoutMs: number;
}

export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number;
  errorMessage: string | null;
}

export async function performTcpCheck(
  options: TcpCheckOptions
): Promise<CheckResult> {
  const { target, timeoutMs } = options;

  // Parse host:port
  const lastColon = target.lastIndexOf(":");
  const host = target.substring(0, lastColon);
  const port = parseInt(target.substring(lastColon + 1), 10);

  if (!host || isNaN(port)) {
    return {
      status: "down",
      responseTimeMs: 0,
      errorMessage: `Invalid target format. Expected host:port, got "${target}"`,
    };
  }

  const start = performance.now();

  return new Promise<CheckResult>((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const responseTimeMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        status: "up",
        responseTimeMs,
        errorMessage: null,
      });
    });

    socket.on("timeout", () => {
      const responseTimeMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        status: "down",
        responseTimeMs,
        errorMessage: `Connection timeout after ${timeoutMs}ms`,
      });
    });

    socket.on("error", (err) => {
      const responseTimeMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        status: "down",
        responseTimeMs,
        errorMessage: err.message,
      });
    });
  });
}
