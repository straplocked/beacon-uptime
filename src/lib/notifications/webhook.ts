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

export async function sendWebhookNotification(
  config: Record<string, string>,
  payload: NotificationPayload
) {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    throw new Error("Webhook URL not configured");
  }

  const secret = config.secret;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Beacon-Webhook/1.0",
  };

  if (secret) {
    // Simple HMAC-like signature for webhook verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const body = JSON.stringify(payload);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    headers["X-Beacon-Signature"] = `sha256=${signatureHex}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook error (${response.status}): ${await response.text()}`);
  }

  console.log(`[notifications/webhook] Sent to ${webhookUrl}`);
}
