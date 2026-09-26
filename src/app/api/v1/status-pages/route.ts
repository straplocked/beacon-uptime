import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusPages } from "@/lib/db/schema";
import { getApiKeyOrg } from "@/lib/auth/api-key";
import { eq, desc } from "drizzle-orm";
import { withRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const org = await getApiKeyOrg(request);
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await withRateLimit(request, `api:${org.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const pages = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.organizationId, org.id))
    .orderBy(desc(statusPages.createdAt));

  return NextResponse.json({ statusPages: pages });
}
