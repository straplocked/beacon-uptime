/**
 * Active-incident banner. Renders only when an open incident exists.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-DASH).
 */

import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  IncidentStatePill,
  SeverityPill,
  type IncidentSeverity,
  type IncidentState,
} from "@/components/dashboard/status-indicators";

export interface ActiveIncidentSummary {
  id: string;
  title: string;
  severity: IncidentSeverity;
  state: IncidentState;
  pageName: string;
  openedAgo: string;
  acknowledgedBy?: { name: string; ago: string };
  commentCount: number;
  mentionCount: number;
}

const severityBg: Record<IncidentSeverity, string> = {
  critical: "var(--severity-critical)",
  major: "var(--severity-major)",
  minor: "var(--severity-minor)",
  none: "var(--severity-none)",
};

export function IncidentBanner({
  incident,
}: {
  incident: ActiveIncidentSummary;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3.5 px-3.5 py-3 mb-4 bg-card rounded-lg shadow-sm"
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${severityBg[incident.severity]}`,
      }}
    >
      <div
        className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
        style={{
          background: `oklch(from ${severityBg[incident.severity]} l c h / 0.14)`,
          color: severityBg[incident.severity],
        }}
      >
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          <span className="text-foreground">{incident.title}</span>
          <SeverityPill severity={incident.severity} />
          <IncidentStatePill state={incident.state} />
          <span className="text-muted-foreground font-normal">
            · on {incident.pageName}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
          <span>Opened {incident.openedAgo} ago</span>
          {incident.acknowledgedBy ? (
            <>
              <span aria-hidden>·</span>
              <span>
                Acked by {incident.acknowledgedBy.name}{" "}
                {incident.acknowledgedBy.ago} ago
              </span>
            </>
          ) : (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: "var(--severity-major)" }}>
                Unacknowledged
              </span>
            </>
          )}
          {incident.commentCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                {incident.commentCount} comment
                {incident.commentCount === 1 ? "" : "s"}
                {incident.mentionCount > 0
                  ? ` · ${incident.mentionCount} mention${incident.mentionCount === 1 ? "" : "s"}`
                  : ""}
              </span>
            </>
          )}
        </div>
      </div>
      <Link
        href={`/incidents/${incident.id}`}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border bg-card text-[11.5px] font-medium hover:bg-muted transition-colors"
      >
        Open thread
        <ChevronRight className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}
