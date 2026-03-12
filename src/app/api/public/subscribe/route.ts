import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusPages, subscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendConfirmationEmail } from "@/lib/notifications/subscriber-email";
import { withRateLimit, getClientIp } from "@/lib/rate-limit";

const subscribeSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimited = await withRateLimit(request, `subscribe:${ip}`, 5, 60);
  if (rateLimited) return rateLimited;

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { slug, email } = parsed.data;

  // Find status page
  const [page] = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.slug, slug))
    .limit(1);

  if (!page || !page.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Generate confirmation token
  const confirmationToken = crypto.randomUUID();

  // Upsert subscriber
  await db
    .insert(subscribers)
    .values({
      statusPageId: page.id,
      email,
      confirmationToken,
      confirmed: false,
    })
    .onConflictDoNothing();

  // Send confirmation email
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const confirmUrl = `${baseUrl}/api/public/confirm/${confirmationToken}`;
  const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe/${confirmationToken}`;

  try {
    await sendConfirmationEmail(email, page.name, confirmUrl, unsubscribeUrl);
  } catch (err) {
    console.error("[subscribe] Failed to send confirmation email:", err);
  }

  return NextResponse.json({ success: true });
}
