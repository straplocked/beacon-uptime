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

export async function sendSlackNotification(
  config: Record<string, string>,
  payload: NotificationPayload
) {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    throw new Error("Slack webhook URL not configured");
  }

  const isDown = payload.event === "monitor.down";
  const color = isDown ? "#ef4444" : "#14b8a6";
  const statusEmoji = isDown ? "🔴" : "🟢";

  const message = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${statusEmoji} *${payload.monitor.name}* is *${payload.check.status.toUpperCase()}*`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Target:*\n${payload.monitor.target}` },
              { type: "mrkdwn", text: `*Type:*\n${payload.monitor.type.toUpperCase()}` },
              ...(payload.check.responseTimeMs
                ? [{ type: "mrkdwn", text: `*Response Time:*\n${payload.check.responseTimeMs}ms` }]
                : []),
              ...(payload.check.error
                ? [{ type: "mrkdwn", text: `*Error:*\n${payload.check.error}` }]
                : []),
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Region: ${payload.check.region} | ${new Date(payload.check.checkedAt).toUTCString()}`,
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook error (${response.status})`);
  }

  console.log(`[notifications/slack] Sent notification for "${payload.monitor.name}"`);
}
