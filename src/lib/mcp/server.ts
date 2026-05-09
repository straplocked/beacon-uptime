/**
 * Beacon Uptime — MCP server.
 *
 * Re-exposes the existing `/api/v1/*` REST surface as Model Context
 * Protocol tools so any MCP client (Claude Desktop, Claude Code, Cursor,
 * custom SDK clients) can manage monitors, query uptime, and acknowledge
 * incidents from chat.
 *
 * Pattern lifted from Strawberry Notes' MCP server:
 *   - Single stateless POST /api/mcp endpoint
 *   - Bearer auth via the existing `bk_` API key (no separate token type)
 *   - Organization context bound at server build time so tool args can
 *     never reach across orgs
 *   - All content I/O is Markdown (text content blocks); errors thrown
 *     by tools propagate as MCP error responses.
 *
 * See docs/MCP.md for the full tool reference + Claude Desktop config.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  checkResults,
  incidents,
  incidentUpdates,
  monitors,
  organizations,
  statusPages,
} from "@/lib/db/schema";
import { canUseApi, getMinCheckInterval, type PlanType } from "@/lib/plans";

type Org = typeof organizations.$inferSelect;

// MCP SDK expects an indexable result type. We return a minimal shape and
// let the SDK's structural typing do the rest.
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonOk(data: unknown) {
  return ok(JSON.stringify(data, null, 2));
}

export function buildMcpServer(org: Org): McpServer {
  const server = new McpServer({
    name: "beacon-uptime",
    version: "1.0.0",
  });

  const orgId = org.id;
  const plan = org.plan as PlanType;

  // Soft plan gate. In OSS edition canUseApi always returns true.
  if (!canUseApi(plan)) {
    // Register a single error-style tool so the LLM gets a clear message.
    server.tool(
      "list_monitors",
      "API access is not available on the current plan.",
      {},
      async () => {
        throw new Error(
          "API access is not available on your plan. Upgrade to Pro or Team.",
        );
      },
    );
    return server;
  }

  /* ─── Monitors ─────────────────────────────── */

  server.tool(
    "list_monitors",
    "List all monitors in the authenticated organization. Returns id, name, type, target, status, and check interval.",
    {},
    async () => {
      const rows = await db
        .select({
          id: monitors.id,
          name: monitors.name,
          type: monitors.type,
          target: monitors.target,
          status: monitors.status,
          intervalSeconds: monitors.intervalSeconds,
          isPaused: monitors.isPaused,
          lastCheckedAt: monitors.lastCheckedAt,
        })
        .from(monitors)
        .where(eq(monitors.organizationId, orgId))
        .orderBy(desc(monitors.createdAt));
      return jsonOk(rows);
    },
  );

  server.tool(
    "get_monitor",
    "Fetch a single monitor by id. Returns the full monitor record.",
    { id: z.string().uuid() },
    async ({ id }) => {
      const [m] = await db
        .select()
        .from(monitors)
        .where(and(eq(monitors.id, id), eq(monitors.organizationId, orgId)))
        .limit(1);
      if (!m) throw new Error(`Monitor ${id} not found`);
      return jsonOk(m);
    },
  );

  const createMonitorSchema = {
    name: z.string().min(1).max(100),
    type: z.enum(["http", "ping", "tcp", "dns", "ssl", "heartbeat"]),
    target: z.string().min(1),
    intervalSeconds: z.number().int().min(30).optional(),
    timeoutMs: z.number().int().min(1000).max(60000).optional(),
    expectedStatusCode: z.number().int().optional(),
    method: z.enum(["GET", "POST", "HEAD"]).optional(),
  } as const;

  server.tool(
    "create_monitor",
    "Create a new monitor. The `type` determines the target format: HTTP/SSL want a URL, TCP wants host:port, DNS/Ping want a hostname or IP. For heartbeat monitors, a token is generated and returned.",
    createMonitorSchema,
    async (args) => {
      const minInterval = getMinCheckInterval(plan);
      const intervalSeconds = Math.max(args.intervalSeconds ?? 60, minInterval);
      let heartbeatToken: string | undefined;
      let heartbeatIntervalSeconds: number | undefined;
      if (args.type === "heartbeat") {
        heartbeatToken = crypto.randomUUID();
        heartbeatIntervalSeconds = intervalSeconds;
      }
      const [monitor] = await db
        .insert(monitors)
        .values({
          organizationId: orgId,
          name: args.name,
          type: args.type,
          target: args.target,
          intervalSeconds,
          timeoutMs: args.timeoutMs ?? 10000,
          expectedStatusCode: args.expectedStatusCode ?? 200,
          method: args.method ?? "GET",
          status: "pending",
          heartbeatToken,
          heartbeatIntervalSeconds,
        })
        .returning();
      return jsonOk(monitor);
    },
  );

  server.tool(
    "update_monitor",
    "Update a monitor's mutable fields. Only fields you pass are changed.",
    {
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      target: z.string().min(1).optional(),
      intervalSeconds: z.number().int().min(30).optional(),
      timeoutMs: z.number().int().min(1000).max(60000).optional(),
      expectedStatusCode: z.number().int().optional(),
      method: z.enum(["GET", "POST", "HEAD"]).optional(),
    },
    async ({ id, ...updates }) => {
      const minInterval = getMinCheckInterval(plan);
      const finalUpdates: Record<string, unknown> = { ...updates };
      if (typeof finalUpdates.intervalSeconds === "number") {
        finalUpdates.intervalSeconds = Math.max(
          finalUpdates.intervalSeconds as number,
          minInterval,
        );
      }
      const [m] = await db
        .update(monitors)
        .set({ ...finalUpdates, updatedAt: new Date() })
        .where(and(eq(monitors.id, id), eq(monitors.organizationId, orgId)))
        .returning();
      if (!m) throw new Error(`Monitor ${id} not found`);
      return jsonOk(m);
    },
  );

  server.tool(
    "delete_monitor",
    "Delete a monitor permanently. This also removes its check history and any auto-incidents.",
    { id: z.string().uuid() },
    async ({ id }) => {
      const result = await db
        .delete(monitors)
        .where(and(eq(monitors.id, id), eq(monitors.organizationId, orgId)))
        .returning({ id: monitors.id });
      if (result.length === 0) throw new Error(`Monitor ${id} not found`);
      return ok(`Deleted monitor ${id}.`);
    },
  );

  server.tool(
    "pause_monitor",
    "Pause a monitor. It will keep its history but no longer be checked.",
    { id: z.string().uuid() },
    async ({ id }) => {
      const [m] = await db
        .update(monitors)
        .set({ isPaused: true, status: "paused", updatedAt: new Date() })
        .where(and(eq(monitors.id, id), eq(monitors.organizationId, orgId)))
        .returning();
      if (!m) throw new Error(`Monitor ${id} not found`);
      return ok(`Paused monitor ${m.name} (${m.id}).`);
    },
  );

  server.tool(
    "resume_monitor",
    "Resume a paused monitor. Status returns to pending until the next check.",
    { id: z.string().uuid() },
    async ({ id }) => {
      const [m] = await db
        .update(monitors)
        .set({ isPaused: false, status: "pending", updatedAt: new Date() })
        .where(and(eq(monitors.id, id), eq(monitors.organizationId, orgId)))
        .returning();
      if (!m) throw new Error(`Monitor ${id} not found`);
      return ok(`Resumed monitor ${m.name} (${m.id}).`);
    },
  );

  /* ─── Checks & analytics ───────────────────── */

  server.tool(
    "get_check_history",
    "Get the most recent check results for a monitor (max 200, newest first). Useful for debugging recent failures.",
    {
      monitorId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async ({ monitorId, limit }) => {
      // Confirm ownership
      const [m] = await db
        .select({ id: monitors.id })
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            eq(monitors.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!m) throw new Error(`Monitor ${monitorId} not found`);
      const rows = await db
        .select({
          time: checkResults.time,
          status: checkResults.status,
          responseTimeMs: checkResults.responseTimeMs,
          statusCode: checkResults.statusCode,
          errorMessage: checkResults.errorMessage,
          region: checkResults.region,
        })
        .from(checkResults)
        .where(eq(checkResults.monitorId, monitorId))
        .orderBy(desc(checkResults.time))
        .limit(limit);
      return jsonOk(rows);
    },
  );

  server.tool(
    "get_uptime_stats",
    "Get uptime + percentile response time stats for a monitor over a window. Window is one of '24h' | '7d' | '30d'.",
    {
      monitorId: z.string().uuid(),
      window: z.enum(["24h", "7d", "30d"]).default("24h"),
    },
    async ({ monitorId, window }) => {
      const [m] = await db
        .select({ id: monitors.id, name: monitors.name })
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            eq(monitors.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!m) throw new Error(`Monitor ${monitorId} not found`);

      const ms =
        window === "24h"
          ? 24 * 60 * 60 * 1000
          : window === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - ms);

      const [stats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          up: sql<
            number
          >`count(*) filter (where ${checkResults.status} = 'up')::int`,
          avg: sql<number | null>`avg(${checkResults.responseTimeMs})::int`,
          p50: sql<
            number | null
          >`percentile_cont(0.5) within group (order by ${checkResults.responseTimeMs})::int`,
          p95: sql<
            number | null
          >`percentile_cont(0.95) within group (order by ${checkResults.responseTimeMs})::int`,
          p99: sql<
            number | null
          >`percentile_cont(0.99) within group (order by ${checkResults.responseTimeMs})::int`,
        })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, monitorId),
            gte(checkResults.time, since),
          ),
        );

      const uptimePct =
        stats && stats.total > 0
          ? Number(((stats.up / stats.total) * 100).toFixed(3))
          : null;

      return jsonOk({
        monitorId,
        monitorName: m.name,
        window,
        sampleCount: stats?.total ?? 0,
        uptimePercent: uptimePct,
        avgResponseMs: stats?.avg ?? null,
        p50Ms: stats?.p50 ?? null,
        p95Ms: stats?.p95 ?? null,
        p99Ms: stats?.p99 ?? null,
      });
    },
  );

  /* ─── Incidents ────────────────────────────── */

  server.tool(
    "list_incidents",
    "List incidents in the organization. Default returns last 50, newest first. Pass `openOnly: true` to filter to in-flight incidents.",
    {
      openOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async ({ openOnly, limit }) => {
      const conds = [eq(incidents.organizationId, orgId)];
      if (openOnly) conds.push(sql`${incidents.status} != 'resolved'`);
      const rows = await db
        .select({
          id: incidents.id,
          title: incidents.title,
          status: incidents.status,
          impact: incidents.impact,
          createdAt: incidents.createdAt,
          resolvedAt: incidents.resolvedAt,
          statusPageId: incidents.statusPageId,
        })
        .from(incidents)
        .where(and(...conds))
        .orderBy(desc(incidents.createdAt))
        .limit(limit);
      return jsonOk(rows);
    },
  );

  server.tool(
    "get_incident",
    "Fetch an incident with its full update timeline.",
    { id: z.string().uuid() },
    async ({ id }) => {
      const [inc] = await db
        .select()
        .from(incidents)
        .where(
          and(eq(incidents.id, id), eq(incidents.organizationId, orgId)),
        )
        .limit(1);
      if (!inc) throw new Error(`Incident ${id} not found`);
      const updates = await db
        .select()
        .from(incidentUpdates)
        .where(eq(incidentUpdates.incidentId, id))
        .orderBy(asc(incidentUpdates.createdAt));
      return jsonOk({ incident: inc, updates });
    },
  );

  server.tool(
    "create_incident",
    "Manually create an incident on a status page. Use this for planned-maintenance announcements or events not auto-detected by monitors.",
    {
      statusPageId: z.string().uuid(),
      title: z.string().min(1).max(200),
      impact: z.enum(["none", "minor", "major", "critical"]).default("minor"),
      status: z
        .enum(["investigating", "identified", "monitoring", "resolved"])
        .default("investigating"),
      message: z.string().min(1).optional(),
    },
    async ({ statusPageId, title, impact, status, message }) => {
      // Confirm the status page belongs to this org
      const [sp] = await db
        .select({ id: statusPages.id })
        .from(statusPages)
        .where(
          and(
            eq(statusPages.id, statusPageId),
            eq(statusPages.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!sp) throw new Error(`Status page ${statusPageId} not found`);

      const [inc] = await db
        .insert(incidents)
        .values({
          organizationId: orgId,
          statusPageId,
          title,
          impact,
          status,
          resolvedAt: status === "resolved" ? new Date() : null,
        })
        .returning();
      if (message) {
        await db.insert(incidentUpdates).values({
          incidentId: inc.id,
          status,
          message,
        });
      }
      return jsonOk(inc);
    },
  );

  server.tool(
    "add_incident_update",
    "Append a status update to an incident. The update is published to the status page and to email subscribers.",
    {
      incidentId: z.string().uuid(),
      status: z.enum([
        "investigating",
        "identified",
        "monitoring",
        "resolved",
      ]),
      message: z.string().min(1).max(2000),
    },
    async ({ incidentId, status, message }) => {
      // Confirm ownership
      const [inc] = await db
        .select({ id: incidents.id })
        .from(incidents)
        .where(
          and(
            eq(incidents.id, incidentId),
            eq(incidents.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!inc) throw new Error(`Incident ${incidentId} not found`);

      const [update] = await db
        .insert(incidentUpdates)
        .values({
          incidentId,
          status,
          message,
        })
        .returning();

      // Roll up the incident status if it changed
      const patch: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };
      if (status === "resolved") patch.resolvedAt = new Date();
      await db
        .update(incidents)
        .set(patch)
        .where(eq(incidents.id, incidentId));

      return jsonOk(update);
    },
  );

  /* ─── Status pages ─────────────────────────── */

  server.tool(
    "list_status_pages",
    "List public status pages in the organization.",
    {},
    async () => {
      const rows = await db
        .select({
          id: statusPages.id,
          name: statusPages.name,
          slug: statusPages.slug,
          customDomain: statusPages.customDomain,
          theme: statusPages.theme,
          brandColor: statusPages.brandColor,
          isPublic: statusPages.isPublic,
        })
        .from(statusPages)
        .where(eq(statusPages.organizationId, orgId))
        .orderBy(desc(statusPages.createdAt));
      return jsonOk(rows);
    },
  );

  return server;
}
