/**
 * Status / severity / incident-state visual primitives.
 *
 * Design source: claude.ai/design — beacon-uptime/project/styles.css
 * (.dot-status, .t-status, .tag-pill, severity pill).
 *
 * Single source of truth for status-color rendering. All consumers should
 * use these instead of literal Tailwind class names like `bg-teal-500`.
 */

import { cn } from "@/lib/utils";

export type MonitorStatus = "up" | "degraded" | "down" | "paused" | "pending";
export type IncidentSeverity = "critical" | "major" | "minor" | "none";
export type IncidentState =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved";

const STATUS_COLOR: Record<MonitorStatus, { fg: string; soft: string }> = {
  up: { fg: "var(--status-up)", soft: "var(--status-up-soft)" },
  degraded: {
    fg: "var(--status-degraded)",
    soft: "var(--status-degraded-soft)",
  },
  down: { fg: "var(--status-down)", soft: "var(--status-down-soft)" },
  paused: { fg: "var(--status-paused)", soft: "var(--status-paused-soft)" },
  pending: {
    fg: "var(--status-pending)",
    soft: "var(--status-pending-soft)",
  },
};

const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Up",
  degraded: "Degraded",
  down: "Down",
  paused: "Paused",
  pending: "Pending",
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: "var(--severity-critical)",
  major: "var(--severity-major)",
  minor: "var(--severity-minor)",
  none: "var(--severity-none)",
};

const INCIDENT_STATE_COLOR: Record<IncidentState, string> = {
  investigating: "var(--incident-investigating)",
  identified: "var(--incident-identified)",
  monitoring: "var(--incident-monitoring)",
  resolved: "var(--incident-resolved)",
};

/* ============== Status dot (inline) ============== */

interface StatusDotProps {
  status: MonitorStatus;
  /** Show the soft halo ring around the dot. */
  halo?: boolean;
  /** Pulse animation — only for `up` and `degraded`. */
  pulse?: boolean;
  size?: number;
  className?: string;
}

export function StatusDot({
  status,
  halo = true,
  pulse = false,
  size = 8,
  className,
}: StatusDotProps) {
  const { fg, soft } = STATUS_COLOR[status];
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn(
        "inline-block rounded-full align-middle",
        pulse && "animate-pulse-dot",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: fg,
        boxShadow: halo ? `0 0 0 3px ${soft}` : undefined,
      }}
    />
  );
}

/* ============== Status pill (label + dot) ============== */

interface StatusPillProps {
  status: MonitorStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  const { fg, soft } = STATUS_COLOR[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-medium",
        className,
      )}
      style={{ background: soft, color: fg }}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: 6, height: 6, background: fg }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ============== Severity pill ============== */

interface SeverityPillProps {
  severity: IncidentSeverity;
  className?: string;
}

export function SeverityPill({ severity, className }: SeverityPillProps) {
  const fg = SEVERITY_COLOR[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider",
        className,
      )}
      style={{
        // oklch(from var) is supported in modern browsers; gracefully degrades.
        background: `oklch(from ${fg} l c h / 0.18)`,
        color: fg,
      }}
    >
      {severity}
    </span>
  );
}

/* ============== Incident-state pill ============== */

interface IncidentStatePillProps {
  state: IncidentState;
  className?: string;
}

export function IncidentStatePill({
  state,
  className,
}: IncidentStatePillProps) {
  const fg = INCIDENT_STATE_COLOR[state];
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider",
        className,
      )}
      style={{
        background: `oklch(from ${fg} l c h / 0.16)`,
        color: fg,
      }}
    >
      {state}
    </span>
  );
}

/* ============== Type pill (HTTP / TCP / DNS / etc.) ============== */

interface TypePillProps {
  type: string;
  className?: string;
}

export function TypePill({ type, className }: TypePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] uppercase tracking-wider font-mono border",
        "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {type}
    </span>
  );
}
