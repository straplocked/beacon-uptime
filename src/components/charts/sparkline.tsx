/**
 * Sparkline — small SVG line chart with optional severity bands.
 *
 * Design source: claude.ai/design — beacon-uptime/project/spark.jsx.
 * Used by stat cards and the monitor table on /dashboard.
 *
 * Renders a server-friendly inline SVG (no Recharts, no client deps) so
 * it fits naturally inside RSC pages.
 */

export interface SparkBand {
  /** Index of the first point in the band. */
  from: number;
  /** Index of the last point in the band. */
  to: number;
  /** Color (CSS color or var()) for the band wash. */
  color: string;
}

interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  /** Stroke + fill base color. Pass a CSS var like `var(--status-up)`. */
  stroke?: string;
  fillOpacity?: number;
  /** Optional severity bands washed behind the line. */
  bands?: SparkBand[];
  className?: string;
  ariaLabel?: string;
}

interface SparkPath {
  line: string;
  area: string;
  xs: number[];
}

function sparkPath(
  points: number[],
  w: number,
  h: number,
  padTop = 4,
  padBottom = 4,
): SparkPath {
  if (!points.length) return { line: "", area: "", xs: [] };
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const innerH = h - padTop - padBottom;
  const xs = points.map((_, i) => (i / Math.max(1, points.length - 1)) * w);
  const ys = points.map((p) => padTop + innerH - ((p - min) / range) * innerH);
  let line = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2;
    line += ` Q ${cx.toFixed(2)} ${ys[i - 1].toFixed(2)} ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`;
  }
  const area = `${line} L ${xs[xs.length - 1].toFixed(2)} ${h} L ${xs[0].toFixed(2)} ${h} Z`;
  return { line, area, xs };
}

export function Sparkline({
  points,
  width = 240,
  height = 36,
  stroke = "var(--primary)",
  fillOpacity = 0.12,
  bands = [],
  className,
  ariaLabel,
}: SparklineProps) {
  const { line, area, xs } = sparkPath(points, width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {bands.map((b, i) => {
        if (!xs.length) return null;
        const x1 = xs[Math.max(0, b.from)] ?? 0;
        const x2 = xs[Math.min(points.length - 1, b.to)] ?? 0;
        return (
          <rect
            key={i}
            x={x1}
            y={0}
            width={Math.max(2, x2 - x1)}
            height={height}
            fill={b.color}
            opacity={0.18}
          />
        );
      })}
      <path d={area} fill={stroke} opacity={fillOpacity} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
