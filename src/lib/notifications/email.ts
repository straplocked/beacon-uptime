interface NotificationPayload {
  event: string;
  monitor: {
    id: string;
    name: string;
    target: string;
    type: string;
  };
  check: {
    status: string;
    statusCode: number | null;
    responseTimeMs: number | null;
    error: string | null;
    checkedAt: string;
    region: string;
  };
  previousStatus: string;
}

export async function sendEmailNotification(
  config: Record<string, string>,
  payload: NotificationPayload
) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "alerts@pluginsynthesis.com";

  if (!apiKey) {
    console.warn("[notifications/email] BREVO_API_KEY not set, skipping email");
    return;
  }

  const toEmail = config.email;
  if (!toEmail) {
    console.warn("[notifications/email] No email address configured");
    return;
  }

  const isDown = payload.event === "monitor.down";
  const subject = isDown
    ? `🔴 ${payload.monitor.name} is DOWN`
    : `🟢 ${payload.monitor.name} is UP`;

  const html = buildEmailHtml(payload, isDown);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "Beacon Uptime" },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${text}`);
  }

  console.log(`[notifications/email] Sent to ${toEmail}: ${subject}`);
}

function buildEmailHtml(payload: NotificationPayload, isDown: boolean): string {
  const statusColor = isDown ? "#ef4444" : "#14b8a6";
  const statusText = isDown ? "DOWN" : "UP";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${statusColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${payload.monitor.name} is ${statusText}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Monitor</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.monitor.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Target</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.monitor.target}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Type</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.monitor.type.toUpperCase()}</td>
          </tr>
          ${payload.check.statusCode ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status Code</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.check.statusCode}</td>
          </tr>` : ""}
          ${payload.check.responseTimeMs ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Response Time</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.check.responseTimeMs}ms</td>
          </tr>` : ""}
          ${payload.check.error ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Error</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right; color: #ef4444;">${payload.check.error}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Region</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${payload.check.region}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Checked At</td>
            <td style="padding: 8px 0; font-size: 14px; text-align: right;">${new Date(payload.check.checkedAt).toUTCString()}</td>
          </tr>
        </table>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
        Sent by Beacon Uptime Monitoring
      </p>
    </div>
  `;
}
