/**
 * Beacon brand mark — "Sweep" variant from the design handoff.
 * Concentric arcs + node + signal line. Suggests transmission / radar sweep.
 *
 * Design source: claude.ai/design — beacon-uptime/project/marks.jsx (MarkSweep).
 * Replaces the lucide `Activity` placeholder used pre-overhaul.
 */

interface BeaconMarkProps {
  size?: number;
  className?: string;
  color?: string;
  "aria-hidden"?: boolean;
}

export function BeaconMark({
  size = 24,
  className,
  color = "currentColor",
  ...rest
}: BeaconMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      className={className}
      {...rest}
    >
      <path d="M5 14a7 7 0 0 1 14 0" opacity={0.35} />
      <path d="M8 14a4 4 0 0 1 8 0" opacity={0.7} />
      <circle cx={12} cy={14} r={1.6} fill={color} stroke="none" />
      <path d="M12 14 L18 6" />
    </svg>
  );
}
