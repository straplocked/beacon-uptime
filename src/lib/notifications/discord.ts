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

export async function sendDiscordNotification(
  config: Record<string, string>,
  payload: NotificationPayload
) {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    throw new Error("Discord webhook URL not configured");
  }

  const isDown = payload.event === "monitor.down";
  const color = isDown ? 0xef4444 : 0x10b981;
  const statusEmoji = isDown ? "🔴" : "🟢";

  const fields = [
    { name: "Target", value: payload.monitor.target, inline: true },
    { name: "Type", value: payload.monitor.type.toUpperCase(), inline: true },
    { name: "Region", value: payload.check.region, inline: true },
  ];

  if (payload.check.responseTimeMs) {
    fields.push({
      name: "Response Time",
      value: `${payload.check.responseTimeMs}ms`,
      inline: true,
    });
  }

  if (payload.check.statusCode) {
    fields.push({
      name: "Status Code",
      value: String(payload.check.statusCode),
      inline: true,
    });
  }

  if (payload.check.error) {
    fields.push({
      name: "Error",
      value: payload.check.error,
      inline: false,
    });
  }

  const message = {
    embeds: [
      {
        title: `${statusEmoji} ${payload.monitor.name} is ${payload.check.status.toUpperCase()}`,
        color,
        fields,
        timestamp: payload.check.checkedAt,
        footer: { text: "Beacon Uptime Monitoring" },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook error (${response.status})`);
  }

  console.log(`[notifications/discord] Sent notification for "${payload.monitor.name}"`);
}
