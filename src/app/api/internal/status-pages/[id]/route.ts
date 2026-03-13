import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  statusPages,
  statusPageMonitors,
  monitors,
} from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { canUseCustomDomain, canUseCustomCss } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { canEditResources } from "@/lib/auth/permissions";

const footerItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string().max(500) }),
  z.object({ type: z.literal("copyright"), companyName: z.string().max(200) }),
  z.object({ type: z.literal("link"), label: z.string().max(100), url: z.string().max(500) }),
]);

const footerSectionSchema = z.object({
  items: z.array(footerItemSchema).max(10),
});

const footerConfigSchema = z.object({
  sections: z.object({
    left: footerSectionSchema.optional(),
    center: footerSectionSchema.optional(),
    right: footerSectionSchema.optional(),
  }),
  showPoweredBy: z.boolean(),
  showRss: z.boolean(),
});

const monitorLinkSchema = z.object({
  monitorId: z.string().uuid(),
  displayName: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).default(0),
  groupName: z.string().max(100).optional(),
  displayStyle: z.enum(["bars", "chart", "compact"]).default("bars"),
});

const updateStatusPageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens")
    .optional(),
  customDomain: z.string().max(255).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  faviconUrl: z.string().max(500).nullable().optional(),
  theme: z.enum(["midnight", "aurora", "clean", "ember", "terminal"]).optional(),
  brandColor: z.string().max(7).optional(),
  customCss: z.string().max(10000).nullable().optional(),
  headerText: z.string().max(500).nullable().optional(),
  footerText: z.string().max(500).nullable().optional(),
  footerConfig: footerConfigSchema.nullable().optional(),
  showUptimePercentage: z.boolean().optional(),
  showResponseTime: z.boolean().optional(),
  showHistoryDays: z.number().int().min(7).max(365).optional(),
  isPublic: z.boolean().optional(),
  monitors: z.array(monitorLinkSchema).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [page] = await db
    .select()
    .from(statusPages)
    .where(and(eq(statusPages.id, id), eq(statusPages.organizationId, ctx.organization.id)))
    .limit(1);

  if (!page) {
    return NextResponse.json(
      { error: "Status page not found" },
      { status: 404 }
    );
  }

  const linkedMonitors = await db
    .select({
      id: statusPageMonitors.id,
      monitorId: statusPageMonitors.monitorId,
      displayName: statusPageMonitors.displayName,
      sortOrder: statusPageMonitors.sortOrder,
      groupName: statusPageMonitors.groupName,
      displayStyle: statusPageMonitors.displayStyle,
      monitorName: monitors.name,
      monitorTarget: monitors.target,
      monitorStatus: monitors.status,
    })
    .from(statusPageMonitors)
    .innerJoin(monitors, eq(statusPageMonitors.monitorId, monitors.id))
    .where(eq(statusPageMonitors.statusPageId, id))
    .orderBy(statusPageMonitors.sortOrder);

  return NextResponse.json({ statusPage: page, monitors: linkedMonitors });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const plan = ctx.organization.plan as PlanType;

  const [existing] = await db
    .select()
    .from(statusPages)
    .where(and(eq(statusPages.id, id), eq(statusPages.organizationId, ctx.organization.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Status page not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = updateStatusPageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

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

  // Verify monitors belong to org if provided
  if (data.monitors && data.monitors.length > 0) {
    const monitorIds = data.monitors.map((m) => m.monitorId);
    const orgMonitors = await db
      .select({ id: monitors.id })
      .from(monitors)
      .where(eq(monitors.organizationId, ctx.organization.id));
    const orgMonitorIds = new Set(orgMonitors.map((m) => m.id));

    for (const mid of monitorIds) {
      if (!orgMonitorIds.has(mid)) {
        return NextResponse.json(
          { error: `Monitor ${mid} not found` },
          { status: 400 }
        );
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.customDomain !== undefined)
      updateData.customDomain = data.customDomain;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.faviconUrl !== undefined) updateData.faviconUrl = data.faviconUrl;
    if (data.theme !== undefined) updateData.theme = data.theme;
    if (data.brandColor !== undefined) updateData.brandColor = data.brandColor;
    if (data.customCss !== undefined) updateData.customCss = data.customCss;
    if (data.headerText !== undefined) updateData.headerText = data.headerText;
    if (data.footerText !== undefined) updateData.footerText = data.footerText;
    if (data.footerConfig !== undefined)
      updateData.footerConfig = data.footerConfig;
    if (data.showUptimePercentage !== undefined)
      updateData.showUptimePercentage = data.showUptimePercentage;
    if (data.showResponseTime !== undefined)
      updateData.showResponseTime = data.showResponseTime;
    if (data.showHistoryDays !== undefined)
      updateData.showHistoryDays = data.showHistoryDays;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    const [page] = await tx
      .update(statusPages)
      .set(updateData)
      .where(eq(statusPages.id, id))
      .returning();

    // Replace monitors if provided
    if (data.monitors !== undefined) {
      await tx
        .delete(statusPageMonitors)
        .where(eq(statusPageMonitors.statusPageId, id));

      if (data.monitors.length > 0) {
        await tx.insert(statusPageMonitors).values(
          data.monitors.map((m) => ({
            statusPageId: id,
            monitorId: m.monitorId,
            displayName: m.displayName || null,
            sortOrder: m.sortOrder,
            groupName: m.groupName || null,
            displayStyle: m.displayStyle,
          }))
        );
      }
    }

    return page;
  });

  return NextResponse.json({ statusPage: result });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(statusPages)
    .where(and(eq(statusPages.id, id), eq(statusPages.organizationId, ctx.organization.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Status page not found" },
      { status: 404 }
    );
  }

  await db.delete(statusPages).where(eq(statusPages.id, id));

  return NextResponse.json({ success: true });
}
