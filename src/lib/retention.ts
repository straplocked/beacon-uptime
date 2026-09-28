/**
 * Data retention window for the whole install — Beacon is a single,
 * unlimited, open-source edition with no per-org or per-plan retention
 * tiers (see CLAUDE.md "One edition, no plan gating").
 *
 * Consumed by two places that must never drift apart:
 *   - src/worker/scheduler.ts — `cleanupOldData()` deletes plain-Postgres
 *     `check_results` rows older than this window every ~1h.
 *   - scripts/migrate.ts — sets the TimescaleDB `check_results` retention
 *     policy to the same window on a Timescale-backed install.
 */
export const DEFAULT_RETENTION_DAYS = 365;

/**
 * Parses `DATA_RETENTION_DAYS` from the environment, falling back to
 * `DEFAULT_RETENTION_DAYS` for anything that isn't a positive integer
 * (unset, empty, non-numeric, zero, negative, or non-finite).
 *
 * `env` defaults to `process.env` and is only a parameter so tests can
 * exercise this without mutating global state.
 */
export function getRetentionDays(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = parseInt(env.DATA_RETENTION_DAYS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}
