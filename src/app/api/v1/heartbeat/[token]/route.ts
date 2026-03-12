import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(eq(monitors.heartbeatToken, token))
    .limit(1);

  if (!monitor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update heartbeat timestamp and set status to up if it was down
  await db
    .update(monitors)
    .set({
      lastHeartbeatAt: new Date(),
      lastCheckedAt: new Date(),
      status: "up",
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitor.id));

  return NextResponse.json({ ok: true });
}

// Also accept POST
export { GET as POST };
