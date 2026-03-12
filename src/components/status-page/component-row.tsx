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
  status: string;
  uptimePercent: string | null;
  dailyStats: DailyStat[];
  showUptime: boolean;
  showResponseTime: boolean;
  days: number;
}

export function ComponentRow({
  name,
  status,
  uptimePercent,
  dailyStats,
  showUptime,
  showResponseTime,
  days,
}: ComponentRowProps) {
  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    up: { label: "Operational", color: "text-emerald-600", icon: "bg-emerald-500" },
    down: { label: "Down", color: "text-red-600", icon: "bg-red-500" },
    degraded: { label: "Degraded", color: "text-yellow-600", icon: "bg-yellow-500" },
    paused: { label: "Paused", color: "text-zinc-400", icon: "bg-zinc-400" },
    pending: { label: "Pending", color: "text-zinc-400", icon: "bg-zinc-300" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${config.icon}`} />
          <span className="font-medium text-zinc-900 text-sm">{name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
          {showUptime && uptimePercent && (
            <span className="text-sm text-zinc-500">{uptimePercent}%</span>
          )}
        </div>
      </div>
      <UptimeBar dailyStats={dailyStats} days={days} />
    </div>
  );
}
