import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusPages, statusPageMonitors, monitors } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, desc, count } from "drizzle-orm";
import { z } from "zod";
import {
  canAddStatusPage,
  canUseCustomDomain,
  canUseCustomCss,
} from "@/lib/plans";
import type { PlanType } from "@/lib/plans";

const monitorLinkSchema = z.object({
  monitorId: z.string().uuid(),
  displayName: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).default(0),
  groupName: z.string().max(100).optional(),
});

const createStatusPageSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  customDomain: z.string().max(255).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  faviconUrl: z.string().max(500).nullable().optional(),
  brandColor: z.string().max(7).default("#14b8a6"),
  customCss: z.string().max(10000).nullable().optional(),
  headerText: z.string().max(500).nullable().optional(),
  footerText: z.string().max(500).nullable().optional(),
  showUptimePercentage: z.boolean().default(true),
  showResponseTime: z.boolean().default(true),
  showHistoryDays: z.number().int().min(7).max(365).default(90),
  isPublic: z.boolean().default(true),
  monitors: z.array(monitorLinkSchema).default([]),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.userId, user.id))
    .orderBy(desc(statusPages.createdAt));

  return NextResponse.json({ statusPages: pages });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createStatusPageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const plan = user.plan as PlanType;
  const data = parsed.data;

  // Check plan limits
  const [pageCount] = await db
    .select({ count: count() })
    .from(statusPages)
    .where(eq(statusPages.userId, user.id));

  if (!canAddStatusPage(plan, pageCount.count)) {
    return NextResponse.json(
      { error: "Status page limit reached for your plan" },
      { status: 403 }
    );
  }

  if (data.customDomain && !canUseCustomDomain(plan)) {
    return NextResponse.json(
      { error: "Custom domains require a Pro or Team plan" },
      { status: 403 }
    );
  }

  if (data.customCss && !canUseCustomCss(plan)) {
    return NextResponse.json(
      { error: "Custom CSS requires a Pro or Team plan" },
      { status: 403 }
    );
  }

  // Verify all monitors belong to the user
  if (data.monitors.length > 0) {
    const monitorIds = data.monitors.map((m) => m.monitorId);
    const userMonitors = await db
      .select({ id: monitors.id })
      .from(monitors)
      .where(eq(monitors.userId, user.id));
    const userMonitorIds = new Set(userMonitors.map((m) => m.id));

    for (const id of monitorIds) {
      if (!userMonitorIds.has(id)) {
        return NextResponse.json(
          { error: `Monitor ${id} not found` },
          { status: 400 }
        );
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(statusPages)
      .values({
        userId: user.id,
        name: data.name,
        slug: data.slug,
        customDomain: data.customDomain || null,
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
        brandColor: data.brandColor,
        customCss: data.customCss || null,
        headerText: data.headerText || null,
        footerText: data.footerText || null,
        showUptimePercentage: data.showUptimePercentage,
        showResponseTime: data.showResponseTime,
        showHistoryDays: data.showHistoryDays,
        isPublic: data.isPublic,
      })
      .returning();

    if (data.monitors.length > 0) {
      await tx.insert(statusPageMonitors).values(
        data.monitors.map((m) => ({
          statusPageId: page.id,
          monitorId: m.monitorId,
          displayName: m.displayName || null,
          sortOrder: m.sortOrder,
          groupName: m.groupName || null,
        }))
      );
    }

    return page;
  });

  return NextResponse.json({ statusPage: result }, { status: 201 });
}
