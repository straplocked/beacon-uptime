"use client";

import { UptimeBar } from "./uptime-bar";

interface DailyStat {
  day: string;
  total: number;
  upCount: number;
  avgResponse: number | null;
}

interface ComponentRowProps {
  name: string;
  target: string;
  status: string;
  uptimePercent: string | null;
  dailyStats: DailyStat[];
  showUptime: boolean;
  showResponseTime: boolean;
  days: number;
}

export function ComponentRow({
  name,
  target,
  status,
  uptimePercent,
  dailyStats,
  showUptime,
  showResponseTime,
  days,
}: ComponentRowProps) {
  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    up: { label: "Operational", color: "text-teal-600", icon: "bg-teal-500" },
    down: { label: "Down", color: "text-red-600", icon: "bg-red-500" },
    degraded: { label: "Degraded", color: "text-amber-600", icon: "bg-amber-500" },
    paused: { label: "Paused", color: "text-slate-400", icon: "bg-slate-400" },
    pending: { label: "Pending", color: "text-slate-400", icon: "bg-slate-300" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 shrink-0 rounded-full ${config.icon}`} />
          <div className="min-w-0">
            <span className="font-medium text-foreground text-sm">{name}</span>
            <span className="block text-xs text-muted-foreground truncate">{target}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
          {showUptime && uptimePercent && (
            <span className="text-sm text-muted-foreground">{uptimePercent}%</span>
          )}
        </div>
      </div>
      <UptimeBar dailyStats={dailyStats} days={days} />
    </div>
  );
}
