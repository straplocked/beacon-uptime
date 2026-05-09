/**
 * Dashboard stat cards.
 *
 * Server component — receives precomputed metrics from the page query layer.
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-DASH).
 */

import { ArrowDown, ArrowUp, Check, Activity, Zap } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";

export interface DashboardStats {
  uptime24h: number; // percent, e.g. 99.78
  uptimeDelta: number | null; // pp delta vs previous 24h, e.g. -0.21
  uptimeSeries: number[]; // 48 hourly samples, percent
  incidents24h: number;
  incidentsOpen: number;
  incidentsMTTRMin: number | null; // null if no resolved incidents
  incidentsDelta: number | null; // count delta
  incidentsSeries: number[]; // 24 hourly samples (counts)
  avgResponseMs: number | null;
  responseDeltaMs: number | null; // ms delta vs prior 24h
  responseSeries: number[]; // 48 hourly samples
  responseBands?: { from: number; to: number; severity: "minor" | "major" | "critical" }[];
  p95Ms: number | null;
  p99Ms: number | null;
  monitorsTotal: number;
  monitorsUp: number;
  monitorsDegraded: number;
  monitorsDown: number;
  monitorsPaused: number;
  monitorsSeries: number[]; // 48 samples (count over time, here simulated as flat from current)
}

function formatDelta(
  value: number | null,
  unit: string,
  digits = 0,
): { text: string; dir: "up" | "down" | "flat" } {
  if (value == null || Number.isNaN(value)) return { text: "—", dir: "flat" };
  const dir = value > 0.001 ? "up" : value < -0.001 ? "down" : "flat";
  const sign = value > 0 ? "+" : "";
  return { text: `${sign}${value.toFixed(digits)}${unit}`, dir };
}

function DeltaBadge({
  value,
  unit,
  digits = 0,
  invertSign = false,
}: {
  value: number | null;
  unit: string;
  digits?: number;
  invertSign?: boolean;
}) {
  const { text, dir } = formatDelta(value, unit, digits);
  // For metrics where "up" is bad (response time, incident count), invert the color.
  const colorDir = invertSign
    ? dir === "up"
      ? "down"
      : dir === "down"
        ? "up"
        : "flat"
    : dir;
  const color =
    colorDir === "up"
      ? "var(--status-up)"
      : colorDir === "down"
        ? "var(--status-down)"
        : "var(--muted-foreground)";
  const Arrow =
    dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : null;
  return (
    <span
      className="ml-auto flex items-center gap-0.5 text-[11px] tabnum"
      style={{ color }}
    >
      {Arrow ? <Arrow className="h-3 w-3" /> : null}
      <span>{text}</span>
    </span>
  );
}

interface StatCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit?: string;
  sub: string;
  delta?: React.ReactNode;
  spark: React.ReactNode;
}

function StatCard({ label, icon, value, unit, sub, delta, spark }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 pb-3 flex flex-col gap-1.5 overflow-hidden">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span className="opacity-85 [&_svg]:h-[13px] [&_svg]:w-[13px]">
          {icon}
        </span>
        <span>{label}</span>
        {delta}
      </div>
      <div className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] tabnum">
        <span>{value}</span>
        {unit && (
          <span className="ml-0.5 text-[14px] font-medium font-mono text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground -mt-0.5">{sub}</div>
      <div className="mt-0.5 h-9 w-full">{spark}</div>
    </div>
  );
}

function severityColor(s: "minor" | "major" | "critical") {
  return s === "critical"
    ? "var(--severity-critical)"
    : s === "major"
      ? "var(--severity-major)"
      : "var(--severity-minor)";
}

export function StatCards({ stats }: { stats: DashboardStats }) {
  const incidentSeriesMax = Math.max(1, ...stats.incidentsSeries);
  const monitorsMax = Math.max(1, ...stats.monitorsSeries);
  const responseBands = (stats.responseBands ?? []).map((b) => ({
    from: b.from,
    to: b.to,
    color: severityColor(b.severity),
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Uptime · 24h"
        icon={<Check />}
        value={stats.uptime24h.toFixed(2)}
        unit="%"
        sub={`${stats.incidents24h} incident${stats.incidents24h === 1 ? "" : "s"} · ${stats.incidentsOpen} active`}
        delta={
          <DeltaBadge
            value={stats.uptimeDelta}
            unit="%"
            digits={2}
            invertSign={false}
          />
        }
        spark={
          <Sparkline
            points={stats.uptimeSeries}
            stroke="var(--status-up)"
            fillOpacity={0.1}
            ariaLabel="24-hour uptime sparkline"
          />
        }
      />

      <StatCard
        label="Incidents · 24h"
        icon={<Activity />}
        value={String(stats.incidents24h)}
        sub={
          stats.incidentsMTTRMin != null
            ? `MTTR ${stats.incidentsMTTRMin}m · ${stats.incidentsOpen} open`
            : `${stats.incidentsOpen} open`
        }
        delta={
          <DeltaBadge
            value={stats.incidentsDelta}
            unit=""
            digits={0}
            invertSign={true}
          />
        }
        spark={
          <svg
            viewBox="0 0 240 36"
            preserveAspectRatio="none"
            width="100%"
            height={36}
            aria-hidden
          >
            <line
              x1={0}
              y1={35.5}
              x2={240}
              y2={35.5}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
            {stats.incidentsSeries.map((v, i) => {
              const w = 240 / stats.incidentsSeries.length;
              const barW = Math.max(2, w - 4);
              if (v > 0) {
                const h = 14 + (v / incidentSeriesMax) * 16;
                return (
                  <rect
                    key={i}
                    x={i * w + (w - barW) / 2}
                    y={32 - h}
                    width={barW}
                    height={h + 2}
                    fill="var(--severity-major)"
                    rx={1}
                  />
                );
              }
              return (
                <rect
                  key={i}
                  x={i * w + (w - barW) / 2 + 1}
                  y={32}
                  width={Math.max(1, barW - 2)}
                  height={2}
                  fill="var(--border)"
                  rx={1}
                  opacity={0.6}
                />
              );
            })}
          </svg>
        }
      />

      <StatCard
        label="Avg Response"
        icon={<Zap />}
        value={
          stats.avgResponseMs != null ? String(stats.avgResponseMs) : "—"
        }
        unit={stats.avgResponseMs != null ? "ms" : undefined}
        sub={
          stats.p95Ms != null && stats.p99Ms != null
            ? `p95 ${stats.p95Ms}ms · p99 ${stats.p99Ms}ms`
            : "no recent checks"
        }
        delta={
          <DeltaBadge
            value={stats.responseDeltaMs}
            unit="ms"
            digits={0}
            invertSign={true}
          />
        }
        spark={
          stats.responseSeries.length > 0 ? (
            <Sparkline
              points={stats.responseSeries}
              stroke="var(--primary)"
              fillOpacity={0.1}
              bands={responseBands}
              ariaLabel="24-hour response time sparkline"
            />
          ) : (
            <div className="h-9 w-full" />
          )
        }
      />

      <StatCard
        label="Monitors"
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 h3 l2 -6 l4 12 l2 -8 l3 5 h4" /></svg>}
        value={String(stats.monitorsTotal)}
        sub={`${stats.monitorsUp} up · ${stats.monitorsDegraded} degraded · ${stats.monitorsDown} down · ${stats.monitorsPaused} paused`}
        delta={
          <span className="ml-auto text-[11px] text-muted-foreground tabnum">
            —
          </span>
        }
        spark={
          <svg
            viewBox="0 0 240 36"
            preserveAspectRatio="none"
            width="100%"
            height={36}
            aria-hidden
          >
            <line
              x1={0}
              y1={35.5}
              x2={240}
              y2={35.5}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
            {stats.monitorsSeries.map((v, i) => {
              const w = 240 / stats.monitorsSeries.length;
              const h = (v / monitorsMax) * 32;
              return (
                <rect
                  key={i}
                  x={i * w + 0.5}
                  y={36 - h}
                  width={Math.max(2, w - 1.5)}
                  height={h}
                  fill="var(--primary)"
                  opacity={0.4 + (i / stats.monitorsSeries.length) * 0.6}
                  rx={1}
                />
              );
            })}
          </svg>
        }
      />
    </div>
  );
}
