/**
 * P-INC-DETAIL — Incident detail page (visual rebuild).
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-INC-DETAIL).
 *
 * NOTE: This is the Sprint 3 visual rebuild. Differentiator #1
 * (Slack-thread-style collaboration: acknowledge, threaded comments,
 * @mentions) lands in Sprint 5 with schema additions
 * (incidents.acknowledgedAt, incidentUpdates.kind, incidentUpdates.mentions).
 * The layout here anticipates that work — the right column is reserved
 * for the conversation thread; today it shows the existing system timeline.
 */

import { and, asc, eq } from "drizzle-orm";
import { CheckCircle2, ChevronRight, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IncidentUpdateForm } from "@/components/dashboard/incident-update-form";
import {
  IncidentStatePill,
  SeverityPill,
  type IncidentSeverity,
  type IncidentState,
} from "@/components/dashboard/status-indicators";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { incidents, incidentUpdates, statusPages } from "@/lib/db/schema";

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

function formatDuration(start: Date, end: Date | null): string {
  const target = end ?? new Date();
  const min = Math.max(0, Math.round((target.getTime() - start.getTime()) / 60000));
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h ${min % 60}m`;
  return `${Math.round(min / 1440)}d`;
}

function formatTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateColor(s: IncidentState): string {
  return s === "investigating"
    ? "var(--incident-investigating)"
    : s === "identified"
      ? "var(--incident-identified)"
      : s === "monitoring"
        ? "var(--incident-monitoring)"
        : "var(--incident-resolved)";
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { id } = await params;

  const [result] = await db
    .select({
      incident: incidents,
      pageName: statusPages.name,
      pageSlug: statusPages.slug,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(
      and(
        eq(incidents.id, id),
        eq(incidents.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);

  if (!result) notFound();

  const updates = await db
    .select()
    .from(incidentUpdates)
    .where(eq(incidentUpdates.incidentId, id))
    .orderBy(asc(incidentUpdates.createdAt));

  const { incident } = result;
  const severity = toSeverity(incident.impact);
  const state = toIncidentState(incident.status);
  const isResolved = state === "resolved" || !!incident.resolvedAt;
  const isOpen = !isResolved;

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-3"
        aria-label="Breadcrumb"
      >
        <Link
          href="/incidents"
          className="hover:text-foreground transition-colors"
        >
          Incidents
        </Link>
        <ChevronRight className="h-3 w-3 opacity-50" />
        <span className="text-foreground font-medium truncate">
          {incident.title}
        </span>
      </nav>

      {/* Header */}
      <header className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.2] m-0 mb-2">
          {incident.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <SeverityPill severity={severity} />
          <IncidentStatePill state={state} />
          <span aria-hidden>·</span>
          <span>
            on{" "}
            <Link
              href={`/status-pages`}
              className="text-foreground hover:underline inline-flex items-center gap-1"
            >
              {result.pageName}
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </Link>
          </span>
          <span aria-hidden>·</span>
          <span>opened {relAgo(incident.createdAt)}</span>
          {isOpen ? (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: stateColor(state) }}>
                ongoing · {formatDuration(incident.createdAt, null)}
              </span>
            </>
          ) : (
            incident.resolvedAt && (
              <>
                <span aria-hidden>·</span>
                <span style={{ color: "var(--incident-resolved)" }}>
                  resolved {relAgo(incident.resolvedAt)} · lasted{" "}
                  {formatDuration(incident.createdAt, incident.resolvedAt)}
                </span>
              </>
            )
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Left: metadata + add-update composer */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground m-0 mb-3 font-medium">
              Summary
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-[12px]">
              <Field label="Created">{formatTime(incident.createdAt)}</Field>
              <Field
                label={incident.resolvedAt ? "Resolved" : "Last update"}
              >
                {formatTime(incident.resolvedAt ?? incident.updatedAt)}
              </Field>
              <Field label="Status page">{result.pageName}</Field>
              <Field label="Updates">{updates.length}</Field>
            </dl>
          </section>

          {/* Add update — visible while incident is open */}
          {isOpen && (
            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-[13px] font-semibold m-0 mb-3 tracking-[-0.005em]">
                Post an update
              </h2>
              <p className="text-[11.5px] text-muted-foreground mb-3">
                Updates push to the public status page and to email subscribers.
              </p>
              <IncidentUpdateForm
                incidentId={incident.id}
                currentStatus={incident.status}
              />
            </section>
          )}

          {isResolved && (
            <section
              className="rounded-lg p-4 border flex items-center gap-3"
              style={{
                background: "oklch(from var(--incident-resolved) l c h / 0.08)",
                borderColor: "oklch(from var(--incident-resolved) l c h / 0.30)",
              }}
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--incident-resolved)" }}
              />
              <p className="text-[12.5px] m-0">
                <span
                  className="font-medium"
                  style={{ color: "var(--incident-resolved)" }}
                >
                  Resolved
                </span>{" "}
                <span className="text-muted-foreground">
                  {incident.resolvedAt
                    ? `${formatTime(incident.resolvedAt)} · ${relAgo(incident.resolvedAt)}`
                    : ""}
                </span>
              </p>
            </section>
          )}
        </div>

        {/* Right: timeline thread (Sprint 5 will extend this with comments + @mentions) */}
        <aside className="bg-card border border-border rounded-lg overflow-hidden min-w-0">
          <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
              Timeline
            </h2>
            <span className="text-muted-foreground text-[11.5px]">
              · {updates.length} update{updates.length === 1 ? "" : "s"}
            </span>
          </header>

          {updates.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Clock className="h-5 w-5 mx-auto mb-1.5 opacity-60" />
              <p className="text-[12.5px] m-0">No updates yet.</p>
            </div>
          ) : (
            <ol className="m-0 p-4 list-none flex flex-col gap-3">
              {updates.map((u, i) => {
                const uState = toIncidentState(u.status);
                const isLast = i === updates.length - 1;
                return (
                  <li key={u.id} className="relative pl-6 pb-3">
                    {/* Vertical thread line */}
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute left-[7px] top-3 bottom-0 w-px"
                        style={{ background: "var(--border)" }}
                      />
                    )}
                    {/* Dot */}
                    <span
                      aria-hidden
                      className="absolute left-1 top-1.5 rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        background: stateColor(uState),
                        boxShadow: `0 0 0 3px var(--card)`,
                      }}
                    />
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <IncidentStatePill state={uState} />
                      <span className="text-[10.5px] font-mono text-muted-foreground">
                        {formatTime(u.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12.5px] m-0 leading-snug whitespace-pre-wrap">
                      {u.message}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
        {label}
      </dt>
      <dd className="text-[12.5px] text-foreground m-0 font-mono">
        {children}
      </dd>
    </div>
  );
}
