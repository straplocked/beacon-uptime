/**
 * Shared helpers for rendering incident summaries on the dashboard.
 *
 * K1 807 — root cause: the dashboard's active-incident query
 * (`src/app/(dashboard)/dashboard/page.tsx`) never selected
 * `acknowledgedAt` / `acknowledgedByUserId` from `incidents`, so
 * `ActiveIncidentSummary.acknowledgedBy` was always `undefined` and the
 * banner showed "Unacknowledged" even for incidents the detail page
 * correctly showed as acknowledged. These helpers are extracted so the
 * mapping logic is unit-testable without standing up the DB-backed page.
 */

/** Short relative-time string, e.g. "5 min", "2h", "3d". No trailing "ago". */
export function formatAgo(date: Date, now: Date = new Date()): string {
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export interface AcknowledgedBySummary {
  name: string;
  ago: string;
}

/**
 * Build the `acknowledgedBy` field for `ActiveIncidentSummary` from the raw
 * incident row's ack columns plus a resolved acknowledger name. Returns
 * `undefined` when the incident hasn't been acknowledged, matching the
 * optional field on `ActiveIncidentSummary`.
 */
export function resolveAcknowledgedBy(
  acknowledgedAt: Date | null | undefined,
  acknowledgerName: string | null | undefined,
  now: Date = new Date(),
): AcknowledgedBySummary | undefined {
  if (!acknowledgedAt) return undefined;
  return {
    name: acknowledgerName ?? "someone",
    ago: formatAgo(acknowledgedAt, now),
  };
}
