const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail(
  to: string,
  subject: string,
  html: string
) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "alerts@pluginsynthesis.com";

  if (!apiKey) {
    console.warn("[subscriber-email] BREVO_API_KEY not set, skipping email");
    return;
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "Beacon Status" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${text}`);
  }
}

export async function sendConfirmationEmail(
  email: string,
  pageName: string,
  confirmUrl: string,
  unsubscribeUrl: string
) {
  const subject = `Confirm your subscription to ${pageName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #10b981; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Confirm Your Subscription</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 14px; color: #374151; line-height: 1.6;">
          You've requested status updates for <strong>${pageName}</strong>.
          Click the button below to confirm your subscription.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${confirmUrl}" style="background: #10b981; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Confirm Subscription
          </a>
        </div>
        <p style="font-size: 12px; color: #9ca3af; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
        <a href="${unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> · Sent by Beacon Status
      </p>
    </div>
  `;

  await sendBrevoEmail(email, subject, html);
  console.log(`[subscriber-email] Confirmation sent to ${email} for ${pageName}`);
}

export async function sendIncidentNotificationEmail(
  email: string,
  pageName: string,
  incidentTitle: string,
  incidentMessage: string,
  statusPageUrl: string,
  unsubscribeUrl: string
) {
  const subject = `[${pageName}] ${incidentTitle}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f59e0b; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${incidentTitle}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 14px; color: #374151; line-height: 1.6;">
          ${incidentMessage}
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${statusPageUrl}" style="background: #3b82f6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            View Status Page
          </a>
        </div>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
        <a href="${unsubscribeUrl}" style="color: #9ca3af;">Unsubscribe</a> · Sent by Beacon Status for ${pageName}
      </p>
    </div>
  `;

  await sendBrevoEmail(email, subject, html);
  console.log(`[subscriber-email] Incident notification sent to ${email}`);
}
