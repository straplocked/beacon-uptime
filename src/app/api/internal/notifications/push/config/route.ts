import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { isPushConfigured } from "@/lib/notifications/push";

/**
 * K1 802 — tells the client whether browser push is available at all and,
 * if so, the VAPID public key needed to subscribe. `VAPID_PRIVATE_KEY` is
 * never sent to the client. When the feature isn't configured, the
 * Settings UI hides the toggle entirely rather than showing a broken one.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = isPushConfigured();

  return NextResponse.json({
    enabled,
    publicKey: enabled ? process.env.VAPID_PUBLIC_KEY : null,
  });
}
