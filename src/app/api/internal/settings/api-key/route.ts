import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/auth/api-key";
import { eq } from "drizzle-orm";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseApi(user.plan as PlanType)) {
    return NextResponse.json(
      { error: "API access requires a Pro or Team plan" },
      { status: 403 }
    );
  }

  const apiKey = generateApiKey();

  await db
    .update(users)
    .set({ apiKey, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ apiKey });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ apiKey: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ success: true });
}
