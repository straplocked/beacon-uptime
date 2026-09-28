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

/**
 * Retry/confirmation policy limits (E5 — flap protection).
 *
 * `confirmationCount` is how many *consecutive* failing checks are required
 * before a monitor is allowed to transition to `down`/`degraded` and open an
 * incident. It is deliberately NOT clamped to a small range server-side
 * beyond a sane ceiling — a value of 1 means "no confirmation, transition
 * immediately" (the historical, pre-E5 behaviour), which is exactly what
 * existing monitors are migrated to so production behaviour doesn't
 * silently change. New monitors default to 2.
 */
export const MIN_CONFIRMATION_COUNT = 1;
export const MAX_CONFIRMATION_COUNT = 10;
export const DEFAULT_CONFIRMATION_COUNT = 2;

export function clampConfirmationCount(requested: number): number {
  return Math.min(
    Math.max(Math.round(requested), MIN_CONFIRMATION_COUNT),
    MAX_CONFIRMATION_COUNT,
  );
}

/**
 * `retryIntervalSeconds` controls how soon the scheduler re-checks a monitor
 * that just failed but hasn't yet met `confirmationCount` — it's meant to
 * confirm-or-clear a flap quickly rather than waiting a full normal
 * `intervalSeconds` cycle.
 *
 * It intentionally does NOT respect `MIN_CHECK_INTERVAL_SECONDS` (30s) as a
 * literal floor — that floor protects *sustained* steady-state check load,
 * whereas a retry only fires a bounded number of times (at most
 * `confirmationCount - 1`) before the monitor either recovers or confirms
 * down. It IS floored at the scheduler's own tick resolution (15s): nothing
 * below that would ever be observed sooner than the next tick, so a lower
 * value would just be misleading. It's also capped at the monitor's own
 * `intervalSeconds` — a "retry" slower than the normal cadence isn't a
 * retry, it's just the normal interval, so we clamp down to it instead of
 * silently ignoring the field.
 */
export const MIN_RETRY_INTERVAL_SECONDS = 15;
export const DEFAULT_RETRY_INTERVAL_SECONDS = 30;

export function clampRetryInterval(
  requestedSeconds: number,
  intervalSeconds: number,
): number {
  const flooredToTick = Math.max(requestedSeconds, MIN_RETRY_INTERVAL_SECONDS);
  return Math.min(flooredToTick, Math.max(intervalSeconds, MIN_RETRY_INTERVAL_SECONDS));
}
