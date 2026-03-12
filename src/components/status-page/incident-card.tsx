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

const impactColors: Record<string, string> = {
  none: "border-l-slate-300",
  minor: "border-l-amber-400",
  major: "border-l-orange-500",
  critical: "border-l-red-500",
};

const statusLabels: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export function IncidentCard({
  title,
  status,
  impact,
  createdAt,
  resolvedAt,
  updates,
}: IncidentCardProps) {
  const borderColor = impactColors[impact] || impactColors.none;

  return (
    <div className={`bg-card rounded-lg border border-l-4 ${borderColor} p-4`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-foreground">{title}</h3>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            status === "resolved"
              ? "bg-teal-100 text-teal-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {statusLabels[status] || status}
        </span>
      </div>

      {updates.length > 0 && (
        <div className="space-y-2 mt-3">
          {updates.map((update, i) => (
            <div key={i} className="text-sm">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-foreground">
                  {statusLabels[update.status] || update.status}
                </span>
                <span className="text-muted-foreground">
                  {new Date(update.createdAt).toLocaleString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-muted-foreground">{update.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {new Date(createdAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}
