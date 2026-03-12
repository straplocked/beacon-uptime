"use client";

interface DailyStat {
  day: string;
  total: number;
  upCount: number;
  avgResponse: number | null;
}

interface CompactRowProps {
  name: string;
  status: string;
  uptimePercent: string | null;
  dailyStats: DailyStat[];
  showUptime: boolean;
  days: number;
}

function statusDotColor(status: string) {
  switch (status) {
    case "up":
      return "var(--sp-accent)";
    case "down":
      return "var(--sp-danger)";
    case "degraded":
      return "var(--sp-warning)";
    default:
      return "var(--sp-text-4)";
  }
}

export function CompactRow({
  name,
  status,
  uptimePercent,
  dailyStats,
  showUptime,
  days,
}: CompactRowProps) {
  const dotColor = statusDotColor(status);

  // Build sparkline points from dailyStats
  const sparklinePoints = (() => {
    const statsMap = new Map<string, DailyStat>();
    for (const stat of dailyStats) {
      const day = new Date(stat.day).toISOString().split("T")[0];
      statsMap.set(day, stat);
    }

    const now = new Date();
    const values: (number | null)[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split("T")[0];
      const stat = statsMap.get(dayKey);
      values.push(stat?.avgResponse ?? null);
    }

    // Filter to non-null values for min/max
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;

    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const w = 80;
    const h = 16;
    const padding = 1;

    const points: string[] = [];
    const step = w / Math.max(values.length - 1, 1);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null) continue;
      const x = i * step;
      const y = padding + ((max - v) / range) * (h - 2 * padding);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    return points.join(" ");
  })();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ fontFamily: "var(--sp-font)" }}
    >
      {/* Status dot */}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: dotColor,
          boxShadow:
            status === "up" || status === "down" || status === "degraded"
              ? `var(--sp-status-glow) ${dotColor}`
              : "none",
        }}
      />

      {/* Name */}
      <span
        className="font-medium text-sm flex-1 min-w-0 truncate"
        style={{ color: "var(--sp-text)" }}
      >
        {name}
      </span>

      {/* Sparkline */}
      {sparklinePoints && (
        <svg
          width="80"
          height="16"
          viewBox="0 0 80 16"
          className="shrink-0"
          style={{ opacity: 0.7 }}
        >
          <polyline
            points={sparklinePoints}
            fill="none"
            stroke="var(--sp-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Uptime */}
      {showUptime && uptimePercent && (
        <span
          className="text-xs tabular-nums shrink-0"
          style={{
            color: "var(--sp-text-3)",
            fontFamily: "var(--sp-mono)",
          }}
        >
          {uptimePercent}%
        </span>
      )}
    </div>
  );
}
