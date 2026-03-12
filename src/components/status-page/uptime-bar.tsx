"use client";

import { useState } from "react";

interface DailyStat {
  day: string;
  total: number;
  upCount: number;
  avgResponse: number | null;
}

interface UptimeBarProps {
  dailyStats: DailyStat[];
  days: number;
}

export function UptimeBar({ dailyStats, days }: UptimeBarProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const statsMap = new Map<string, DailyStat>();
  for (const stat of dailyStats) {
    const day = new Date(stat.day).toISOString().split("T")[0];
    statsMap.set(day, stat);
  }

  const now = new Date();
  const segments = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().split("T")[0];
    const stat = statsMap.get(dayKey);

    let color = "var(--sp-bar-empty)";
    let label = "No data";

    if (stat && stat.total > 0) {
      const upPercent = (stat.upCount / stat.total) * 100;
      if (upPercent >= 99) {
        color = "var(--sp-bar-up)";
        label = `${upPercent.toFixed(1)}% uptime`;
      } else if (upPercent >= 95) {
        color = "var(--sp-bar-degraded)";
        label = `${upPercent.toFixed(1)}% uptime`;
      } else {
        color = "var(--sp-bar-down)";
        label = `${upPercent.toFixed(1)}% uptime`;
      }
      if (stat.avgResponse) {
        label += ` \u00b7 ${stat.avgResponse}ms avg`;
      }
    }

    segments.push({
      dayKey,
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      color,
      label,
    });
  }

  return (
    <div className="relative">
      <div className="flex gap-[2px]">
        {segments.map((seg, i) => (
          <div
            key={seg.dayKey}
            className="relative flex-1"
            onMouseEnter={() => setHoveredDay(i)}
            onMouseLeave={() => setHoveredDay(null)}
          >
            <div
              className={`h-6 rounded-[3px] transition-all duration-150 cursor-pointer ${
                hoveredDay === i ? "opacity-100 scale-y-110" : "opacity-90 hover:opacity-100"
              }`}
              style={{ background: seg.color }}
            />
            {hoveredDay === i && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 text-[11px] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl"
                style={{
                  background: "var(--sp-tooltip-bg)",
                  color: "var(--sp-text)",
                  border: "1px solid var(--sp-border)",
                }}
              >
                <p className="font-medium">{seg.date}</p>
                <p style={{ color: "var(--sp-text-2)" }}>{seg.label}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[10px]" style={{ color: "var(--sp-text-3)" }}>{days} days ago</span>
        <span className="text-[10px]" style={{ color: "var(--sp-text-3)" }}>Today</span>
      </div>
    </div>
  );
}
