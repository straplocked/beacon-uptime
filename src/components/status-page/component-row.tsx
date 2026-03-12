"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UptimeBar } from "./uptime-bar";

interface DailyStat {
  day: string;
  total: number;
  upCount: number;
  avgResponse: number | null;
}

interface RecentCheck {
  time: string;
  status: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  region: string;
}

interface ComponentRowProps {
  name: string;
  target: string;
  type: string;
  status: string;
  uptimePercent: string | null;
  avgResponse: number | null;
  minResponse: number | null;
  maxResponse: number | null;
  intervalSeconds: number;
  lastCheckedAt: string | null;
  dailyStats: DailyStat[];
  recentChecks: RecentCheck[];
  showUptime: boolean;
  showResponseTime: boolean;
  days: number;
}

export function ComponentRow({
  name,
  target,
  type,
  status,
  uptimePercent,
  avgResponse,
  minResponse,
  maxResponse,
  intervalSeconds,
  lastCheckedAt,
  dailyStats,
  recentChecks,
  showUptime,
  showResponseTime,
  days,
}: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    up: { label: "Operational", color: "text-teal-600", icon: "bg-teal-500" },
    down: { label: "Down", color: "text-red-600", icon: "bg-red-500" },
    degraded: { label: "Degraded", color: "text-amber-600", icon: "bg-amber-500" },
    paused: { label: "Paused", color: "text-slate-400", icon: "bg-slate-400" },
    pending: { label: "Pending", color: "text-slate-400", icon: "bg-slate-300" },
  };

  const checkStatusColor: Record<string, string> = {
    up: "bg-teal-500",
    down: "bg-red-500",
    degraded: "bg-amber-500",
  };

  const config = statusConfig[status] || statusConfig.pending;

  function formatInterval(s: number) {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
      >
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
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <UptimeBar dailyStats={dailyStats} days={days} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Avg Response</p>
              <p className="text-sm font-semibold">
                {avgResponse != null ? `${avgResponse}ms` : "—"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Min / Max</p>
              <p className="text-sm font-semibold">
                {minResponse != null && maxResponse != null
                  ? `${minResponse}ms / ${maxResponse}ms`
                  : "—"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Check Interval</p>
              <p className="text-sm font-semibold">{formatInterval(intervalSeconds)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Last Checked</p>
              <p className="text-sm font-semibold">
                {lastCheckedAt ? timeAgo(lastCheckedAt) : "—"}
              </p>
            </div>
          </div>

          {/* Recent checks */}
          {recentChecks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Recent Checks
              </p>
              <div className="space-y-1">
                {recentChecks.map((check, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          checkStatusColor[check.status] || "bg-slate-300"
                        }`}
                      />
                      <span className="text-muted-foreground font-mono">
                        {new Date(check.time).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {check.statusCode && (
                        <span className="text-muted-foreground">{check.statusCode}</span>
                      )}
                      {check.responseTimeMs != null && (
                        <span className="text-foreground font-medium tabular-nums w-16 text-right">
                          {check.responseTimeMs}ms
                        </span>
                      )}
                      <span className="text-muted-foreground/60 w-14 text-right">
                        {check.region}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
