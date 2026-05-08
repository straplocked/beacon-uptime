"use client";

/**
 * Check history table — token-driven, mono numerals, click-to-expand details.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-MON-DETAIL).
 * Replaces the previous version that used inline reds and a flat list.
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  StatusDot,
  type MonitorStatus,
} from "@/components/dashboard/status-indicators";
import { cn } from "@/lib/utils";

interface Check {
  time: string; // ISO
  status: string; // db enum: "up" | "down" | "degraded"
  responseTimeMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  region: string;
}

function toMonitorStatus(s: string): MonitorStatus {
  if (s === "up" || s === "down" || s === "degraded") return s;
  return "pending";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CheckHistory({ checks }: { checks: Check[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (checks.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8 text-[13px]">
        No checks recorded yet.
      </p>
    );
  }

  return (
    <div className="max-h-[480px] overflow-y-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 bg-card z-[1]">
          <tr>
            <th className="w-9" />
            <th className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
              Time
            </th>
            <th className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border w-[80px]">
              Status
            </th>
            <th className="text-right px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border w-[80px]">
              Code
            </th>
            <th className="text-right px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border w-[100px]">
              Response
            </th>
            <th className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border w-[80px]">
              Region
            </th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => {
            const id = `${c.time}-${i}`;
            const isExpanded = expanded === id;
            const hasDetail = !!c.errorMessage;
            const status = toMonitorStatus(c.status);
            return (
              <Row
                key={id}
                check={c}
                status={status}
                isExpanded={isExpanded}
                hasDetail={hasDetail}
                onToggle={() => setExpanded(isExpanded ? null : id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  check,
  status,
  isExpanded,
  hasDetail,
  onToggle,
}: {
  check: Check;
  status: MonitorStatus;
  isExpanded: boolean;
  hasDetail: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={hasDetail ? onToggle : undefined}
        className={cn(
          "border-b border-border transition-colors",
          hasDetail ? "cursor-pointer hover:bg-muted/60" : "",
          isExpanded ? "bg-muted" : "",
        )}
      >
        <td className="text-center text-muted-foreground">
          {hasDetail ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 inline-block" />
            ) : (
              <ChevronRight className="h-3 w-3 inline-block" />
            )
          ) : null}
        </td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <StatusDot status={status} size={6} halo={false} />
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {formatTime(check.time)}
            </span>
          </span>
        </td>
        <td className="px-3 py-2 capitalize text-[12px]">
          <span
            className="font-medium"
            style={{
              color:
                status === "up"
                  ? "var(--status-up)"
                  : status === "degraded"
                    ? "var(--status-degraded)"
                    : status === "down"
                      ? "var(--status-down)"
                      : "var(--muted-foreground)",
            }}
          >
            {check.status}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          {check.statusCode != null ? (
            <span className="font-mono tabnum text-[11.5px]">
              {check.statusCode}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {check.responseTimeMs != null ? (
            <span className="font-mono tabnum text-[11.5px]">
              {check.responseTimeMs}
              <span className="text-muted-foreground text-[10px] ml-px">
                ms
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {check.region}
          </span>
        </td>
      </tr>
      {isExpanded && check.errorMessage && (
        <tr>
          <td colSpan={6} className="bg-muted px-3 py-2.5 border-b border-border">
            <div className="pl-9">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">
                Error
              </div>
              <pre
                className="font-mono text-[11.5px] whitespace-pre-wrap break-words m-0"
                style={{ color: "var(--status-down)" }}
              >
                {check.errorMessage}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
