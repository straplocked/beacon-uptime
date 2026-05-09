/**
 * P-INC-DETAIL — Incident detail with collaboration UI (Sprint 5 / Diff #1).
 *
 * Adds:
 *   - Acknowledge state in the header (button when not yet ack'd; ack'd-by
 *     metadata when claimed)
 *   - kind-aware timeline rendering: status updates publish, comments are
 *     internal-only with a subtle visual treatment, system events show as
 *     compact one-liners
 *   - composer with status-update vs internal-comment toggle (handled by
 *     IncidentUpdateForm)
 */

import { and, asc, eq } from "drizzle-orm";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcknowledgeButton } from "@/components/dashboard/acknowledge-button";
import { IncidentUpdateForm } from "@/components/dashboard/incident-update-form";
import {
  IncidentStatePill,
  SeverityPill,
  type IncidentSeverity,
  type IncidentState,
} from "@/components/dashboard/status-indicators";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  incidents,
  incidentUpdates,
  statusPages,
  users,
} from "@/lib/db/schema";

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

function relAgo(d: Date | null | undefined): string {
  if (!d) return "never";
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

  // Pull updates with author info via left-join (authoredByUserId is nullable).
  const updates = await db
    .select({
      id: incidentUpdates.id,
      status: incidentUpdates.status,
      message: incidentUpdates.message,
      kind: incidentUpdates.kind,
      mentions: incidentUpdates.mentions,
      createdAt: incidentUpdates.createdAt,
      authoredByUserId: incidentUpdates.authoredByUserId,
      authorName: users.name,
    })
    .from(incidentUpdates)
    .leftJoin(users, eq(incidentUpdates.authoredByUserId, users.id))
    .where(eq(incidentUpdates.incidentId, id))
    .orderBy(asc(incidentUpdates.createdAt));

  // Acknowledger lookup
  let acknowledger: { name: string } | null = null;
  if (result.incident.acknowledgedByUserId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, result.incident.acknowledgedByUserId))
      .limit(1);
    acknowledger = u ?? null;
  }

  const { incident } = result;
  const severity = toSeverity(incident.impact);
  const state = toIncidentState(incident.status);
  const isResolved = state === "resolved" || !!incident.resolvedAt;
  const isOpen = !isResolved;
  const isAcknowledged = !!incident.acknowledgedAt;

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
      <header className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
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
          {/* Ack metadata */}
          {isAcknowledged && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <CheckCircle2
                className="h-3 w-3"
                style={{ color: "var(--incident-resolved)" }}
              />
              <span>
                Acknowledged{" "}
                {acknowledger ? `by ${acknowledger.name} ` : ""}
                {incident.acknowledgedAt &&
                  `${relAgo(incident.acknowledgedAt)}`}
              </span>
            </div>
          )}
        </div>

        {/* Action bar */}
        {isOpen && !isAcknowledged && (
          <AcknowledgeButton incidentId={incident.id} />
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
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
              <Field
                label={
                  isAcknowledged ? "Acknowledged" : "Acknowledge state"
                }
              >
                {isAcknowledged && incident.acknowledgedAt
                  ? formatTime(incident.acknowledgedAt)
                  : "Unclaimed"}
              </Field>
            </dl>
          </section>

          {isOpen && (
            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-[13px] font-semibold m-0 mb-3 tracking-[-0.005em]">
                Post an update
              </h2>
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
                background:
                  "oklch(from var(--incident-resolved) l c h / 0.08)",
                borderColor:
                  "oklch(from var(--incident-resolved) l c h / 0.30)",
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

        {/* Right: thread (status updates + comments + system events) */}
        <aside className="bg-card border border-border rounded-lg overflow-hidden min-w-0">
          <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
              Conversation
            </h2>
            <span className="text-muted-foreground text-[11.5px]">
              · {updates.length} entr
              {updates.length === 1 ? "y" : "ies"}
            </span>
          </header>

          {updates.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Clock className="h-5 w-5 mx-auto mb-1.5 opacity-60" />
              <p className="text-[12.5px] m-0">No entries yet.</p>
            </div>
          ) : (
            <ol className="m-0 p-4 list-none flex flex-col gap-3">
              {updates.map((u, i) => {
                const uState = toIncidentState(u.status);
                const isLast = i === updates.length - 1;
                const kind = u.kind as "status" | "comment" | "system";
                const author = u.authorName ?? "system";
                return (
                  <li key={u.id} className="relative pl-7 pb-3">
                    {/* Vertical thread line */}
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute left-[9px] top-4 bottom-0 w-px"
                        style={{ background: "var(--border)" }}
                      />
                    )}
                    {/* Avatar / glyph */}
                    {kind === "comment" ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 flex items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground"
                        style={{
                          width: 18,
                          height: 18,
                          background:
                            "linear-gradient(135deg, var(--primary), oklch(0.55 0.18 280))",
                        }}
                      >
                        {author.charAt(0).toUpperCase()}
                      </span>
                    ) : kind === "system" ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 flex items-center justify-center rounded-full"
                        style={{
                          width: 18,
                          height: 18,
                          background: "var(--muted)",
                          border: "1px solid var(--border)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        <Clock className="h-2.5 w-2.5" />
                      </span>
                    ) : (
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
                    )}
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {kind === "status" && (
                        <IncidentStatePill state={uState} />
                      )}
                      {kind === "comment" && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-foreground">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {author}
                          <span
                            className="text-[10px] uppercase tracking-wider px-1 rounded font-semibold"
                            style={{
                              background:
                                "oklch(from var(--primary) l c h / 0.14)",
                              color: "var(--primary)",
                            }}
                          >
                            internal
                          </span>
                        </span>
                      )}
                      {kind === "system" && (
                        <span className="inline-flex items-center text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          system
                        </span>
                      )}
                      <span className="text-[10.5px] font-mono text-muted-foreground">
                        {formatTime(u.createdAt)}
                      </span>
                    </div>
                    <p
                      className={
                        "m-0 leading-snug whitespace-pre-wrap " +
                        (kind === "system"
                          ? "text-[12px] text-muted-foreground italic"
                          : "text-[12.5px]")
                      }
                    >
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
