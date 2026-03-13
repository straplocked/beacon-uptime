import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { canEditResources } from "@/lib/auth/permissions";
import { generateApiKey } from "@/lib/auth/api-key";
import { eq } from "drizzle-orm";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions to manage API keys" },
      { status: 403 }
    );
  }

  if (!canUseApi(ctx.organization.plan as PlanType)) {
    return NextResponse.json(
      { error: "API access requires a Pro or Team plan" },
      { status: 403 }
    );
  }

  const apiKey = generateApiKey();

  await db
    .update(organizations)
    .set({ apiKey, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.organization.id));

  return NextResponse.json({ apiKey });
}

export async function DELETE() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions to manage API keys" },
      { status: 403 }
    );
  }

  await db
    .update(organizations)
    .set({ apiKey: null, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.organization.id));

  return NextResponse.json({ success: true });
}
