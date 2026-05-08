/**
 * P-INC-LIST — Incident list page.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-INC-LIST).
 * Token-driven status / severity pills replace the previous hardcoded
 * Tailwind color classes. Filters live on the page via URL search params.
 */

import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import {
  IncidentStatePill,
  SeverityPill,
  type IncidentSeverity,
  type IncidentState,
} from "@/components/dashboard/status-indicators";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { incidents, statusPages } from "@/lib/db/schema";

type Filter = "open" | "resolved" | "all";

function toSeverity(impact: string): IncidentSeverity {
  if (
    impact === "critical" ||
    impact === "major" ||
    impact === "minor" ||
    impact === "none"
  )
    return impact;
  return "minor";
}

function toIncidentState(s: string): IncidentState {
  if (
    s === "investigating" ||
    s === "identified" ||
    s === "monitoring" ||
    s === "resolved"
  )
    return s;
  return "investigating";
}

function relAgo(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(start: Date, end: Date): string {
  const min = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

interface PageProps {
  searchParams?: Promise<{ filter?: string; severity?: string }>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const sp = (await searchParams) ?? {};
  const filter: Filter =
    sp.filter === "resolved" || sp.filter === "all" ? sp.filter : "open";

  // Build conditions
  const conds: any[] = [eq(incidents.organizationId, ctx.organization.id)];
  if (filter === "open") {
    conds.push(or(ne(incidents.status, "resolved"), isNull(incidents.resolvedAt)));
  } else if (filter === "resolved") {
    conds.push(eq(incidents.status, "resolved"));
  }

  const rows = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      impact: incidents.impact,
      createdAt: incidents.createdAt,
      updatedAt: incidents.updatedAt,
      resolvedAt: incidents.resolvedAt,
      pageName: statusPages.name,
      pageSlug: statusPages.slug,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(and(...conds))
    .orderBy(desc(incidents.createdAt))
    .limit(200);

  // Counts for filter badges (always count both)
  const [openCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, ctx.organization.id),
        or(
          ne(incidents.status, "resolved"),
          isNull(incidents.resolvedAt),
        ),
      ),
    );
  const [resolvedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, ctx.organization.id),
        eq(incidents.status, "resolved"),
      ),
    );

  const totalCount = (openCount?.count ?? 0) + (resolvedCount?.count ?? 0);

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
            Incidents
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Track and manage incidents across your status pages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/incidents/new"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            New incident
          </Link>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <FilterChip
          label="Open"
          count={openCount?.count ?? 0}
          active={filter === "open"}
          href="/incidents?filter=open"
        />
        <FilterChip
          label="Resolved"
          count={resolvedCount?.count ?? 0}
          active={filter === "resolved"}
          href="/incidents?filter=resolved"
        />
        <FilterChip
          label="All"
          count={totalCount}
          active={filter === "all"}
          href="/incidents?filter=all"
        />
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-lg text-center py-16 px-4">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-60" />
          <p className="font-medium text-[14px]">
            {filter === "open"
              ? "No open incidents"
              : filter === "resolved"
                ? "No resolved incidents yet"
                : "No incidents"}
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Incidents auto-create when a monitor goes down.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {rows.map((inc, i) => {
            const isOpen = inc.status !== "resolved" && !inc.resolvedAt;
            return (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className={
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 " +
                  (i < rows.length - 1 ? "border-b border-border" : "")
                }
              >
                {/* Severity glyph */}
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                  style={{
                    background: `oklch(from ${
                      isOpen
                        ? sevColor(toSeverity(inc.impact))
                        : "var(--incident-resolved)"
                    } l c h / 0.14)`,
                    color: isOpen
                      ? sevColor(toSeverity(inc.impact))
                      : "var(--incident-resolved)",
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[13.5px] text-foreground truncate">
                      {inc.title}
                    </span>
                    <SeverityPill severity={toSeverity(inc.impact)} />
                    <IncidentStatePill state={toIncidentState(inc.status)} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-muted-foreground flex-wrap">
                    <span>on {inc.pageName}</span>
                    <span aria-hidden>·</span>
                    <span>opened {relAgo(inc.createdAt)}</span>
                    {inc.resolvedAt && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          duration {formatDuration(inc.createdAt, inc.resolvedAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sevColor(s: IncidentSeverity): string {
  return s === "critical"
    ? "var(--severity-critical)"
    : s === "major"
      ? "var(--severity-major)"
      : s === "minor"
        ? "var(--severity-minor)"
        : "var(--severity-none)";
}

function FilterChip({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={
        "h-6 px-2 rounded-md text-[11.5px] flex items-center gap-1.5 border transition-colors " +
        (active
          ? "bg-muted text-foreground border-border-strong"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted")
      }
    >
      {label}
      <span className="text-muted-foreground tabnum">{count}</span>
    </Link>
  );
}
