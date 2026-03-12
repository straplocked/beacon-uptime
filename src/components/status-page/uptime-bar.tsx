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

  // Build a map of day -> stats for quick lookup
  const statsMap = new Map<string, DailyStat>();
  for (const stat of dailyStats) {
    const day = new Date(stat.day).toISOString().split("T")[0];
    statsMap.set(day, stat);
  }

  // Generate array of days
  const now = new Date();
  const segments = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().split("T")[0];
    const stat = statsMap.get(dayKey);

    let color = "bg-zinc-200"; // no data
    let label = "No data";

    if (stat && stat.total > 0) {
      const upPercent = (stat.upCount / stat.total) * 100;
      if (upPercent >= 99) {
        color = "bg-emerald-500";
        label = `${upPercent.toFixed(1)}% uptime`;
      } else if (upPercent >= 95) {
        color = "bg-yellow-500";
        label = `${upPercent.toFixed(1)}% uptime (degraded)`;
      } else {
        color = "bg-red-500";
        label = `${upPercent.toFixed(1)}% uptime (outage)`;
      }

      if (stat.avgResponse) {
        label += ` | ${stat.avgResponse}ms avg`;
      }
    }

    segments.push({
      dayKey,
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      color,
      label,
    });
  }

  return (
    <div className="relative">
      <div className="flex gap-px">
        {segments.map((seg, i) => (
          <div
            key={seg.dayKey}
            className="relative flex-1"
            onMouseEnter={() => setHoveredDay(i)}
            onMouseLeave={() => setHoveredDay(null)}
          >
            <div
              className={`h-8 rounded-sm ${seg.color} transition-opacity hover:opacity-80 cursor-pointer`}
            />
            {hoveredDay === i && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 bg-zinc-900 text-white text-xs rounded-md px-3 py-2 whitespace-nowrap shadow-lg">
                <p className="font-medium">{seg.date}</p>
                <p className="text-zinc-300">{seg.label}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-zinc-400">{days} days ago</span>
        <span className="text-xs text-zinc-400">Today</span>
      </div>
    </div>
  );
}
