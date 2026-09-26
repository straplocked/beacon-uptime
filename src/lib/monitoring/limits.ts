/**
 * Hard operational limits for monitor scheduling.
 *
 * These are NOT plan gates — Beacon is a single, unlimited, open-source
 * edition. This floor exists to protect the scheduler and the targets being
 * monitored: the scheduling loop ticks every 15s, so anything below ~30s
 * would queue checks faster than they can drain and would hammer the target.
 *
 * Enforced by the monitor-create/update paths:
 *   - src/app/api/internal/monitors/route.ts
 *   - src/app/api/v1/monitors/route.ts
 *   - src/lib/mcp/server.ts (create_monitor, update_monitor)
 */
export const MIN_CHECK_INTERVAL_SECONDS = 30;

/**
 * Clamp a requested check interval up to the operational floor.
 */
export function clampCheckInterval(requestedSeconds: number): number {
  return Math.max(requestedSeconds, MIN_CHECK_INTERVAL_SECONDS);
}
