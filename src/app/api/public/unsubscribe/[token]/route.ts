import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [subscriber] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.confirmationToken, token))
    .limit(1);

  if (!subscriber) {
    return new Response(htmlPage("Not Found", "This unsubscribe link is invalid."), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!subscriber.unsubscribedAt) {
    await db
      .update(subscribers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(subscribers.id, subscriber.id));
  }

  return new Response(htmlPage("Unsubscribed", "You have been unsubscribed and will no longer receive status updates."), {
    headers: { "Content-Type": "text/html" },
  });
}

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Beacon</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; border-radius: 12px; padding: 48px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); max-width: 400px; }
    h1 { font-size: 20px; color: #111827; margin: 0 0 8px; }
    p { font-size: 14px; color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
