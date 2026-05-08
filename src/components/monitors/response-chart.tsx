"use client";

/**
 * Response time chart with optional incident-severity overlays.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-MON-DETAIL).
 * Token-driven (no hex literals). Replaces the legacy chart with the
 * `#14b8a6` hardcode that the system audit flagged.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartPoint {
  time: string;
  responseTime: number;
  status: "up" | "degraded" | "down";
}

export interface IncidentBand {
  /** Index of the first point inside the band (inclusive). */
  fromIndex: number;
  /** Index of the last point inside the band (inclusive). */
  toIndex: number;
  /** Severity of the incident — drives the overlay color. */
  severity: "minor" | "major" | "critical";
}

interface ResponseChartProps {
  data: ChartPoint[];
  /** Optional bands marking incident windows. */
  bands?: IncidentBand[];
  /** Force a stroke variant. Defaults to `--primary`; auto-shifts to `--status-degraded` if the latest point is degraded. */
  variant?: "primary" | "degraded" | "down" | "auto";
  /** Pixel height. */
  height?: number;
}

function severityVar(s: "minor" | "major" | "critical") {
  return s === "critical"
    ? "var(--severity-critical)"
    : s === "major"
      ? "var(--severity-major)"
      : "var(--severity-minor)";
}

function strokeVar(variant: ResponseChartProps["variant"], data: ChartPoint[]) {
  if (variant && variant !== "auto") {
    return variant === "primary"
      ? "var(--primary)"
      : variant === "degraded"
        ? "var(--status-degraded)"
        : "var(--status-down)";
  }
  // auto — read the trailing point
  const last = data.at(-1);
  if (!last) return "var(--primary)";
  if (last.status === "degraded") return "var(--status-degraded)";
  if (last.status === "down") return "var(--status-down)";
  return "var(--primary)";
}

export function ResponseChart({
  data,
  bands = [],
  variant = "auto",
  height = 320,
}: ResponseChartProps) {
  const stroke = strokeVar(variant, data);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: -8 }}
        >
          <defs>
            <linearGradient id="rcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{
              fontSize: 11,
              fill: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={48}
          />
          <YAxis
            tick={{
              fontSize: 11,
              fill: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
            tickLine={false}
            axisLine={false}
            width={48}
            unit="ms"
          />
          {bands.map((b, i) => {
            const from = data[b.fromIndex]?.time;
            const to = data[Math.min(data.length - 1, b.toIndex)]?.time;
            if (!from || !to) return null;
            return (
              <ReferenceArea
                key={i}
                x1={from}
                x2={to}
                strokeOpacity={0}
                fill={severityVar(b.severity)}
                fillOpacity={0.14}
              />
            );
          })}
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "2 4" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              padding: "6px 10px",
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              marginBottom: 2,
            }}
            formatter={(value) => [`${value}ms`, "Response time"]}
          />
          <Area
            type="monotone"
            dataKey="responseTime"
            stroke={stroke}
            fill="url(#rcFill)"
            strokeWidth={1.5}
            isAnimationActive={false}
            activeDot={{
              r: 3,
              stroke: stroke,
              strokeWidth: 1.5,
              fill: "var(--card)",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
