import * as tls from "tls";

export interface SslCheckOptions {
  target: string; // hostname
  timeoutMs: number;
}

export interface CheckResult {
  status: "up" | "down" | "degraded";
  responseTimeMs: number;
  errorMessage: string | null;
  tlsExpiry: Date | null;
}

export async function performSslCheck(
  options: SslCheckOptions
): Promise<CheckResult> {
  const { target, timeoutMs } = options;

  // Extract host and optional port
  const parts = target.split(":");
  const host = parts[0];
  const port = parts[1] ? parseInt(parts[1], 10) : 443;

  const start = performance.now();

  return new Promise<CheckResult>((resolve) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        timeout: timeoutMs,
        rejectUnauthorized: true,
      },
      () => {
        const responseTimeMs = Math.round(performance.now() - start);

        const cert = socket.getPeerCertificate();
        socket.destroy();

        if (!cert || !cert.valid_to) {
          resolve({
            status: "down",
            responseTimeMs,
            errorMessage: "Unable to retrieve certificate",
            tlsExpiry: null,
          });
          return;
        }

        const expiryDate = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        let status: "up" | "down" | "degraded";
        let errorMessage: string | null = null;

        if (daysUntilExpiry <= 0) {
          status = "down";
          errorMessage = "SSL certificate has expired";
        } else if (daysUntilExpiry <= 7) {
          status = "degraded";
          errorMessage = `SSL certificate expires in ${daysUntilExpiry} days`;
        } else if (daysUntilExpiry <= 14) {
          status = "degraded";
          errorMessage = `SSL certificate expires in ${daysUntilExpiry} days`;
        } else {
          status = "up";
        }

        resolve({
          status,
          responseTimeMs,
          errorMessage,
          tlsExpiry: expiryDate,
        });
      }
    );

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        status: "down",
        responseTimeMs: Math.round(performance.now() - start),
        errorMessage: `Connection timeout after ${timeoutMs}ms`,
        tlsExpiry: null,
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({
        status: "down",
        responseTimeMs: Math.round(performance.now() - start),
        errorMessage: err.message,
        tlsExpiry: null,
      });
    });
  });
}
