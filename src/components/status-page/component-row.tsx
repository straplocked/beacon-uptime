"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UptimeBar } from "./uptime-bar";
import { ChartRow } from "./chart-row";
import { CompactRow } from "./compact-row";
import type { DisplayStyle } from "@/lib/types/footer";

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
  displayStyle?: DisplayStyle;
}

function statusStyle(status: string) {
  switch (status) {
    case "up": return { color: "var(--sp-accent)", dot: "var(--sp-accent)" };
    case "down": return { color: "var(--sp-danger)", dot: "var(--sp-danger)" };
    case "degraded": return { color: "var(--sp-warning)", dot: "var(--sp-warning)" };
    default: return { color: "var(--sp-text-3)", dot: "var(--sp-text-4)" };
  }
}

const statusLabel: Record<string, string> = {
  up: "Operational",
  down: "Down",
  degraded: "Degraded",
  paused: "Paused",
  pending: "Pending",
};

const checkDotColor: Record<string, string> = {
  up: "var(--sp-accent)",
  down: "var(--sp-danger)",
  degraded: "var(--sp-warning)",
};

export function ComponentRow(props: ComponentRowProps) {
  const { displayStyle = "bars" } = props;

  if (displayStyle === "chart") {
    return <ChartRow {...props} />;
  }

  if (displayStyle === "compact") {
    return (
      <CompactRow
        name={props.name}
        status={props.status}
        uptimePercent={props.uptimePercent}
        dailyStats={props.dailyStats}
        showUptime={props.showUptime}
        days={props.days}
      />
    );
  }

  return <BarsRow {...props} />;
}

function BarsRow({
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
  const sty = statusStyle(status);

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
        className="w-full text-left p-4 transition-colors"
        style={{ fontFamily: "var(--sp-font)" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--sp-surface-hover)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: sty.dot,
                boxShadow: status === "up" || status === "down" || status === "degraded"
                  ? `var(--sp-status-glow) ${sty.dot}`
                  : "none",
              }}
            />
            <div className="min-w-0">
              <span className="font-medium text-sm" style={{ color: "var(--sp-text)" }}>{name}</span>
              <span
                className="block text-[11px] truncate"
                style={{ color: "var(--sp-text-3)", fontFamily: "var(--sp-mono)" }}
              >
                {target}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: sty.color }}>
              {statusLabel[status] || "Unknown"}
            </span>
            {showUptime && uptimePercent && (
              <span
                className="text-xs tabular-nums"
                style={{ color: "var(--sp-text-3)", fontFamily: "var(--sp-mono)" }}
              >
                {uptimePercent}%
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              style={{ color: "var(--sp-text-3)" }}
            />
          </div>
        </div>
        <UptimeBar dailyStats={dailyStats} days={days} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Avg Response", value: avgResponse != null ? `${avgResponse}ms` : "\u2014" },
              { label: "Min / Max", value: minResponse != null && maxResponse != null ? `${minResponse} / ${maxResponse}ms` : "\u2014" },
              { label: "Interval", value: formatInterval(intervalSeconds) },
              { label: "Last Check", value: lastCheckedAt ? timeAgo(lastCheckedAt) : "\u2014" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg p-3"
                style={{ background: "var(--sp-surface)", border: "1px solid var(--sp-border)" }}
              >
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--sp-text-3)" }}>
                  {stat.label}
                </p>
                <p
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: "var(--sp-text-2)", fontFamily: "var(--sp-mono)" }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {recentChecks.length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2"
                style={{ color: "var(--sp-text-3)" }}
              >
                Recent Checks
              </p>
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--sp-border)" }}>
                {recentChecks.map((check, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs py-2 px-3"
                    style={{ background: i % 2 === 0 ? "var(--sp-surface)" : "transparent" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: checkDotColor[check.status] || "var(--sp-text-4)" }}
                      />
                      <span style={{ color: "var(--sp-text-3)", fontFamily: "var(--sp-mono)" }} suppressHydrationWarning>
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
                        <span style={{ color: "var(--sp-text-4)", fontFamily: "var(--sp-mono)" }}>
                          {check.statusCode}
                        </span>
                      )}
                      {check.responseTimeMs != null && (
                        <span
                          className="font-medium tabular-nums w-16 text-right"
                          style={{ color: "var(--sp-text-2)", fontFamily: "var(--sp-mono)" }}
                        >
                          {check.responseTimeMs}ms
                        </span>
                      )}
                      <span
                        className="w-14 text-right text-[10px]"
                        style={{ color: "var(--sp-text-4)", fontFamily: "var(--sp-mono)" }}
                      >
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
