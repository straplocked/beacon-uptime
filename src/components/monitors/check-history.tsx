"use client";

import { Badge } from "@/components/ui/badge";

interface Check {
  time: string;
  status: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  region: string;
}

export function CheckHistory({ checks }: { checks: Check[] }) {
  if (checks.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No checks recorded yet.
      </p>
    );
  }

  return (
    <div className="divide-y max-h-96 overflow-y-auto">
      {checks.map((check, i) => (
        <div key={i} className="flex items-center justify-between py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full ${
                check.status === "up"
                  ? "bg-emerald-500"
                  : check.status === "degraded"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
            <span className="text-muted-foreground">
              {new Date(check.time).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {check.statusCode && (
              <Badge variant="outline" className="text-xs">
                {check.statusCode}
              </Badge>
            )}
            {check.responseTimeMs !== null && (
              <span className="text-muted-foreground text-xs w-16 text-right">
                {check.responseTimeMs}ms
              </span>
            )}
            {check.errorMessage && (
              <span className="text-red-500 text-xs max-w-48 truncate">
                {check.errorMessage}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
