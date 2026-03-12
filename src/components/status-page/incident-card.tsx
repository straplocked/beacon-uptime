"use client";

interface IncidentUpdate {
  status: string;
  message: string;
  createdAt: string;
}

interface IncidentCardProps {
  title: string;
  status: string;
  impact: string;
  createdAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

const statusLabels: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

function impactBorderColor(impact: string): string {
  switch (impact) {
    case "minor": return "var(--sp-warning)";
    case "major": return "var(--sp-warning)";
    case "critical": return "var(--sp-danger)";
    default: return "var(--sp-border)";
  }
}

function updateDotColor(status: string): string {
  if (status === "resolved") return "var(--sp-accent)";
  if (status === "monitoring") return "var(--sp-accent)";
  return "var(--sp-warning)";
}

function statusBadgeStyle(status: string) {
  if (status === "resolved") {
    return { background: "var(--sp-accent-subtle)", color: "var(--sp-accent)", border: "var(--sp-accent-border)" };
  }
  return { background: "var(--sp-warning-subtle)", color: "var(--sp-warning)", border: "var(--sp-warning-border)" };
}

export function IncidentCard({
  title,
  status,
  impact,
  createdAt,
  resolvedAt,
  updates,
}: IncidentCardProps) {
  const badge = statusBadgeStyle(status);

  return (
    <div
      className="rounded-xl p-4 backdrop-blur-sm"
      style={{
        background: "var(--sp-surface)",
        border: "1px solid var(--sp-border)",
        borderLeft: `3px solid ${impactBorderColor(impact)}`,
        fontFamily: "var(--sp-font)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-sm" style={{ color: "var(--sp-text)" }}>{title}</h3>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{
            background: badge.background,
            color: badge.color,
            border: `1px solid ${badge.border}`,
          }}
        >
          {statusLabels[status] || status}
        </span>
      </div>

      {updates.length > 0 && (
        <div className="space-y-2 mt-3">
          {updates.map((update, i) => (
            <div key={i} className="text-sm flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: updateDotColor(update.status), opacity: 0.7 }}
                />
                {i < updates.length - 1 && (
                  <span className="w-px flex-1 mt-1" style={{ background: "var(--sp-divider)" }} />
                )}
              </div>
              <div className="pb-3 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-xs" style={{ color: "var(--sp-text-2)" }}>
                    {statusLabels[update.status] || update.status}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--sp-text-3)", fontFamily: "var(--sp-mono)" }}
                    suppressHydrationWarning
                  >
                    {new Date(update.createdAt).toLocaleString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--sp-text-3)" }}>
                  {update.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="mt-3 text-[11px]"
        style={{ color: "var(--sp-text-4)", fontFamily: "var(--sp-mono)" }}
        suppressHydrationWarning
      >
        {new Date(createdAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}
