"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown } from "lucide-react";

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

interface ChartRowProps {
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

function statusStyle(status: string) {
  switch (status) {
    case "up":
      return { color: "var(--sp-accent)", dot: "var(--sp-accent)" };
    case "down":
      return { color: "var(--sp-danger)", dot: "var(--sp-danger)" };
    case "degraded":
      return { color: "var(--sp-warning)", dot: "var(--sp-warning)" };
    default:
      return { color: "var(--sp-text-3)", dot: "var(--sp-text-4)" };
  }
}

const statusLabel: Record<string, string> = {
  up: "Operational",
  down: "Down",
  degraded: "Degraded",
  paused: "Paused",
  pending: "Pending",
};

export function ChartRow({
  name,
  target,
  status,
  uptimePercent,
  dailyStats,
  showUptime,
  days,
}: ChartRowProps) {
  const [expanded, setExpanded] = useState(false);
  const sty = statusStyle(status);

  const chartData = (() => {
    const statsMap = new Map<string, DailyStat>();
    for (const stat of dailyStats) {
      const day = new Date(stat.day).toISOString().split("T")[0];
      statsMap.set(day, stat);
    }

    const now = new Date();
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split("T")[0];
      const stat = statsMap.get(dayKey);
      data.push({
        day: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        response: stat?.avgResponse ?? null,
      });
    }
    return data;
  })();

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 transition-colors"
        style={{ fontFamily: "var(--sp-font)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--sp-surface-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: sty.dot,
                boxShadow:
                  status === "up" ||
                  status === "down" ||
                  status === "degraded"
                    ? `var(--sp-status-glow) ${sty.dot}`
                    : "none",
              }}
            />
            <div className="min-w-0">
              <span
                className="font-medium text-sm"
                style={{ color: "var(--sp-text)" }}
              >
                {name}
              </span>
              <span
                className="block text-[11px] truncate"
                style={{
                  color: "var(--sp-text-3)",
                  fontFamily: "var(--sp-mono)",
                }}
              >
                {target}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-medium"
              style={{ color: sty.color }}
            >
              {statusLabel[status] || "Unknown"}
            </span>
            {showUptime && uptimePercent && (
              <span
                className="text-xs tabular-nums"
                style={{
                  color: "var(--sp-text-3)",
                  fontFamily: "var(--sp-mono)",
                }}
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

        {/* Response time chart */}
        <div style={{ height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`chart-grad-${name.replace(/\s/g, "-")}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="var(--sp-accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--sp-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={false}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--sp-tooltip-bg)",
                  border: "1px solid var(--sp-border)",
                  borderRadius: 8,
                  color: "var(--sp-text)",
                  fontSize: 11,
                }}
                formatter={(value) =>
                  value != null ? [`${value}ms`, "Avg Response"] : ["\u2014", "Avg Response"]
                }
              />
              <Area
                type="monotone"
                dataKey="response"
                stroke="var(--sp-accent)"
                strokeWidth={1.5}
                fill={`url(#chart-grad-${name.replace(/\s/g, "-")})`}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between mt-1">
          <span
            className="text-[10px]"
            style={{ color: "var(--sp-text-3)" }}
          >
            {days} days ago
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--sp-text-3)" }}
          >
            Today
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: "var(--sp-surface)",
              border: "1px solid var(--sp-border)",
              color: "var(--sp-text-3)",
              fontFamily: "var(--sp-mono)",
            }}
          >
            {uptimePercent
              ? `${uptimePercent}% uptime over the last ${days} days`
              : "No data available"}
          </div>
        </div>
      )}
    </div>
  );
}
