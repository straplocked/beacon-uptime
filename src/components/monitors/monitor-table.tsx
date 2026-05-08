"use client";

/**
 * Dense monitor table with expandable 90-day uptime rows.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-DASH).
 * Sortable + expand-to-detail interactions are client-only; data comes from
 * the server in a fully-resolved shape.
 */

import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Sparkline } from "@/components/charts/sparkline";
import {
  StatusDot,
  StatusPill,
  TypePill,
  type MonitorStatus,
} from "@/components/dashboard/status-indicators";
import { cn } from "@/lib/utils";

export interface MonitorRow {
  id: string;
  name: string;
  target: string;
  type: string; // "http" | "tcp" | ...
  status: MonitorStatus;
  /** Last response time in ms, or null if no recent check. */
  lastResponseMs: number | null;
  /** Seconds since last check. */
  lastCheckAgoSec: number | null;
  /** Recent response times for the inline sparkline (oldest → newest). */
  series: number[];
  /** Optional severity bands on the sparkline (incident overlays). */
  bands?: { from: number; to: number; severity: "minor" | "major" | "critical" }[];
  /** 24h uptime percent. */
  uptime24h: number | null;
  /** 90-day uptime percent. */
  uptime90d: number | null;
  /** 90-day uptime per-day status string array, length 90. */
  uptime90Series?: ("up" | "degraded" | "down" | "empty")[];
  intervalSec: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

const STATUS_SORT_ORDER: Record<MonitorStatus, number> = {
  down: 0,
  degraded: 1,
  paused: 2,
  pending: 3,
  up: 4,
};

function severityToken(s: "minor" | "major" | "critical") {
  return s === "critical"
    ? "var(--severity-critical)"
    : s === "major"
      ? "var(--severity-major)"
      : "var(--severity-minor)";
}

type SortCol = "status" | "name" | "response";

export interface MonitorTableProps {
  monitors: MonitorRow[];
  /**
   * Section title rendered inside the table card. Set to null to hide the
   * internal header (e.g. when the page itself owns the title chrome).
   * @default "Monitors"
   */
  title?: string | null;
  /** Auto-expand the first non-up monitor (default true). */
  autoExpandFirstIssue?: boolean;
  /** Render type filter chips alongside status filters. */
  enableTypeFilter?: boolean;
  /** Optional list of available monitor types for the type filter. */
  availableTypes?: string[];
  /** Compact = no border / no rounded card wrapper (page already provides chrome). */
  bare?: boolean;
}

export function MonitorTable({
  monitors,
  title = "Monitors",
  autoExpandFirstIssue = true,
  enableTypeFilter = false,
  availableTypes = [],
  bare = false,
}: MonitorTableProps) {
  const [expanded, setExpanded] = useState<string | null>(() => {
    if (!autoExpandFirstIssue) return null;
    const first = monitors.find(
      (m) => m.status !== "up" && m.status !== "paused",
    );
    return first?.id ?? null;
  });
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({
    col: "status",
    dir: "asc",
  });
  const [filter, setFilter] = useState<"all" | MonitorStatus>("all");
  const [typeFilter, setTypeFilter] = useState<string | "all">("all");

  const sorted = useMemo(() => {
    let arr = filter === "all" ? [...monitors] : monitors.filter((m) => m.status === filter);
    if (typeFilter !== "all") {
      arr = arr.filter((m) => m.type.toLowerCase() === typeFilter.toLowerCase());
    }
    if (sort.col === "status") {
      arr.sort(
        (a, b) =>
          (STATUS_SORT_ORDER[a.status] ?? 99) -
          (STATUS_SORT_ORDER[b.status] ?? 99),
      );
    } else if (sort.col === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort.col === "response") {
      arr.sort(
        (a, b) =>
          (a.lastResponseMs ?? Number.POSITIVE_INFINITY) -
          (b.lastResponseMs ?? Number.POSITIVE_INFINITY),
      );
    }
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [monitors, sort, filter]);

  const toggleSort = (col: SortCol) => {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  };

  const sortInd = (col: SortCol) =>
    sort.col === col ? (sort.dir === "asc" ? "↑" : "↓") : "";

  const counts = useMemo(() => {
    const c = { up: 0, degraded: 0, down: 0, paused: 0, pending: 0 };
    for (const m of monitors) c[m.status]++;
    return c;
  }, [monitors]);

  const wrapperCn = bare
    ? "overflow-hidden"
    : "bg-card border border-border rounded-lg overflow-hidden";

  const filterRow = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <FilterChip
        label="All"
        active={filter === "all"}
        onClick={() => setFilter("all")}
      />
      <FilterChip
        label="Up"
        count={counts.up}
        active={filter === "up"}
        onClick={() => setFilter("up")}
      />
      {counts.degraded > 0 && (
        <FilterChip
          label="Degraded"
          count={counts.degraded}
          active={filter === "degraded"}
          onClick={() => setFilter("degraded")}
        />
      )}
      {counts.down > 0 && (
        <FilterChip
          label="Down"
          count={counts.down}
          active={filter === "down"}
          onClick={() => setFilter("down")}
        />
      )}
      {counts.paused > 0 && (
        <FilterChip
          label="Paused"
          count={counts.paused}
          active={filter === "paused"}
          onClick={() => setFilter("paused")}
        />
      )}
      {enableTypeFilter && availableTypes.length > 0 && (
        <>
          <span className="w-px h-4 bg-border mx-1" aria-hidden />
          <FilterChip
            label="All types"
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          />
          {availableTypes.map((t) => (
            <FilterChip
              key={t}
              label={t.toUpperCase()}
              active={typeFilter === t.toLowerCase()}
              onClick={() => setTypeFilter(t.toLowerCase())}
            />
          ))}
        </>
      )}
      {title !== null && (
        <Link
          href="/monitors/new"
          className="ml-1 inline-flex items-center gap-1 h-6 px-2 rounded-md border border-transparent bg-primary text-primary-foreground text-[11.5px] font-medium hover:opacity-95 transition-opacity"
        >
          <Plus className="h-3 w-3" />
          New monitor
        </Link>
      )}
    </div>
  );

  return (
    <div className={wrapperCn}>
      {title !== null ? (
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border flex-wrap">
          <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
            {title}{" "}
            <span className="text-muted-foreground font-normal">
              · {monitors.length}
            </span>
          </h2>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {filterRow}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-border">{filterRow}</div>
      )}

      {sorted.length === 0 ? (
        <EmptyState filtered={filter !== "all"} />
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-9 pl-4" />
              <th
                className="text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 cursor-pointer hover:text-foreground border-b border-border"
                onClick={() => toggleSort("name")}
              >
                Monitor <span className="ml-1 opacity-60">{sortInd("name")}</span>
              </th>
              <th className="text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 border-b border-border w-[70px]">
                Type
              </th>
              <th
                className="text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 cursor-pointer hover:text-foreground border-b border-border w-[100px]"
                onClick={() => toggleSort("status")}
              >
                Status <span className="ml-1 opacity-60">{sortInd("status")}</span>
              </th>
              <th className="text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 border-b border-border w-[230px]">
                Last 48 checks
              </th>
              <th
                className="text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 cursor-pointer hover:text-foreground border-b border-border w-[100px]"
                onClick={() => toggleSort("response")}
              >
                Response{" "}
                <span className="ml-1 opacity-60">{sortInd("response")}</span>
              </th>
              <th className="text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground py-2 px-3 border-b border-border w-[110px]">
                Last check
              </th>
              <th className="w-9 pr-4 border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <MonitorTableRow
                key={m.id}
                m={m}
                expanded={expanded === m.id}
                onToggle={() =>
                  setExpanded(expanded === m.id ? null : m.id)
                }
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-6 px-2 rounded-md text-[11.5px] flex items-center gap-1.5 border transition-colors",
        active
          ? "bg-muted text-foreground border-border-strong"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted",
      )}
    >
      {label}
      {count != null && (
        <span className="text-muted-foreground tabnum">{count}</span>
      )}
    </button>
  );
}

function MonitorTableRow({
  m,
  expanded,
  onToggle,
}: {
  m: MonitorRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const bands = (m.bands ?? []).map((b) => ({
    from: b.from,
    to: b.to,
    color: severityToken(b.severity),
  }));

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "transition-colors cursor-pointer",
          expanded ? "bg-muted" : "hover:bg-muted/60",
        )}
        style={{ height: "var(--row-h)" }}
      >
        <td className="pl-4">
          <StatusDot status={m.status} pulse={m.status === "up"} />
        </td>
        <td className="px-3">
          <Link
            href={`/monitors/${m.id}`}
            className="flex flex-col gap-px"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-medium text-[13px] text-foreground hover:underline">
              {m.name}
            </span>
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {m.target}
            </span>
          </Link>
        </td>
        <td className="px-3">
          <TypePill type={m.type} />
        </td>
        <td className="px-3">
          <StatusPill status={m.status} />
        </td>
        <td className="px-3">
          {m.series.length > 1 ? (
            <Sparkline
              points={m.series}
              width={200}
              height={26}
              stroke={
                m.status === "degraded"
                  ? "var(--status-degraded)"
                  : m.status === "down"
                    ? "var(--status-down)"
                    : "var(--primary)"
              }
              fillOpacity={0.12}
              bands={bands}
            />
          ) : (
            <span className="text-[11.5px] text-muted-foreground">
              no checks yet
            </span>
          )}
        </td>
        <td className="px-3 text-right">
          {m.lastResponseMs != null ? (
            <span className="font-mono tabnum text-[12px] text-foreground">
              {m.lastResponseMs}
              <span className="text-muted-foreground text-[10.5px] ml-px">
                ms
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[12px]">—</span>
          )}
        </td>
        <td className="px-3 text-right">
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {m.lastCheckAgoSec != null
              ? `${formatAgo(m.lastCheckAgoSec)}`
              : "—"}
          </span>
        </td>
        <td className="pr-4 text-right">
          <button
            onClick={(e) => e.stopPropagation()}
            aria-label="Row actions"
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end px-4 py-3.5 pl-10 bg-muted border-b border-border">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>90-day uptime</span>
                  <span className="font-mono text-[12px] tracking-normal text-foreground">
                    {m.uptime90d != null ? `${m.uptime90d.toFixed(2)}%` : "—"}
                  </span>
                </div>
                <UptimeBar series={m.uptime90Series ?? []} />
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                <Stat label="p50" value={m.p50Ms != null ? `${m.p50Ms}ms` : "—"} />
                <Stat label="p95" value={m.p95Ms != null ? `${m.p95Ms}ms` : "—"} />
                <Stat label="p99" value={m.p99Ms != null ? `${m.p99Ms}ms` : "—"} />
                <Stat label="Interval" value={`${m.intervalSec}s`} />
                <Stat
                  label="24h"
                  value={
                    m.uptime24h != null ? `${m.uptime24h.toFixed(2)}%` : "—"
                  }
                />
                <Link
                  href={`/monitors/${m.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="self-end inline-flex items-center h-6 px-2 rounded-md border border-border bg-card text-[11.5px] font-medium hover:bg-card/80 transition-colors text-foreground"
                >
                  Open
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div>{label}</div>
      <b className="text-foreground font-mono font-medium text-[12px]">
        {value}
      </b>
    </div>
  );
}

function UptimeBar({
  series,
}: {
  series: ("up" | "degraded" | "down" | "empty")[];
}) {
  const cells = series.length === 90 ? series : Array(90).fill("empty");
  return (
    <div className="flex gap-[2px] h-7 items-end">
      {cells.map((kind, i) => (
        <span
          key={i}
          title={`Day ${90 - i}: ${kind}`}
          className="flex-1 rounded-[1px]"
          style={{
            height: kind === "down" ? "70%" : kind === "empty" ? "50%" : "100%",
            background:
              kind === "up"
                ? "var(--status-up)"
                : kind === "degraded"
                  ? "var(--status-degraded)"
                  : kind === "down"
                    ? "var(--status-down)"
                    : "var(--border)",
            opacity: kind === "empty" ? 0.5 : 0.85,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="text-center py-12 px-4 text-muted-foreground">
      {filtered ? (
        <>
          <p className="text-[13px] font-medium text-foreground">
            No monitors match this filter
          </p>
          <p className="text-[12px] mt-1">Try a different status filter.</p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium text-foreground">
            No monitors yet
          </p>
          <p className="text-[12px] mt-1">
            <Link href="/monitors/new" className="text-primary hover:underline">
              Create your first monitor
            </Link>{" "}
            to start tracking uptime.
          </p>
        </>
      )}
    </div>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
