import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { getRetentionDays } from "../src/lib/retention";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function errorCause(e: unknown): unknown {
  return e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  // Step 1: Enable TimescaleDB extension (this may restart the DB connection).
  // TimescaleDB is optional: on a plain PostgreSQL server (e.g. a shared
  // postgres:17 container) the extension isn't installed, so Beacon runs on
  // ordinary tables and skips steps 3-6. Retention is then handled by the
  // scheduler's DATA_RETENTION_DAYS cleanup alone.
  let timescale = true;
  console.log("[migrate] Enabling TimescaleDB extension...");
  try {
    const extClient = postgres(databaseUrl, { max: 1 });
    const extDb = drizzle(extClient);
    await extDb.execute(sql`CREATE EXTENSION IF NOT EXISTS timescaledb`);
    await extClient.end();
    console.log("[migrate] TimescaleDB extension enabled");
  } catch (e: unknown) {
    // Connection reset is expected when extension loads for the first time
    const cause = errorCause(e) as { code?: string } | undefined;
    const errMsg = errorMessage(e) + String(cause?.code || "");
    if (errMsg.includes("ECONNRESET") || errMsg.includes("connection reset")) {
      console.log("[migrate] TimescaleDB extension triggered server reload, waiting...");
      await sleep(5000);
    } else if (errMsg.includes("already loaded") || errMsg.includes("already exists")) {
      console.log("[migrate] TimescaleDB already loaded");
    } else if (/is not available|could not open extension control file|0A000|58P01/.test(errMsg)) {
      timescale = false;
      console.log("[migrate] TimescaleDB is not installed on this server; using plain PostgreSQL tables");
    } else {
      throw e;
    }
  }

  // Step 2: Run Drizzle migrations with a fresh connection
  console.log("[migrate] Connecting to database...");
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  // Verify connection
  await db.execute(sql`SELECT 1`);
  console.log("[migrate] Connected successfully");

  console.log("[migrate] Running Drizzle migrations...");
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  console.log("[migrate] Drizzle migrations complete");

  if (timescale) {
    // Step 3: Convert check_results to a hypertable
    console.log("[migrate] Setting up TimescaleDB hypertable...");
    try {
      await db.execute(
        sql`SELECT create_hypertable('check_results', 'time', if_not_exists => TRUE)`
      );
      console.log("[migrate] Hypertable created/verified");
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (msg.includes("already a hypertable")) {
        console.log("[migrate] check_results is already a hypertable");
      } else {
        console.warn("[migrate] Hypertable note:", msg);
      }
    }

    // Step 4: Create continuous aggregates
    console.log("[migrate] Setting up continuous aggregates...");

    try {
      await db.execute(sql`
        CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_uptime
        WITH (timescaledb.continuous) AS
        SELECT
          monitor_id,
          time_bucket('1 hour', time) AS bucket,
          COUNT(*) AS total_checks,
          COUNT(*) FILTER (WHERE status = 'up') AS up_checks,
          AVG(response_time_ms) AS avg_response_time,
          MAX(response_time_ms) AS max_response_time,
          MIN(response_time_ms) AS min_response_time
        FROM check_results
        GROUP BY monitor_id, bucket
      `);
      console.log("[migrate] hourly_uptime aggregate created");
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (msg.includes("already exists")) {
        console.log("[migrate] hourly_uptime aggregate already exists");
      } else {
        console.warn("[migrate] Could not create hourly_uptime:", msg);
      }
    }

    try {
      await db.execute(sql`
        CREATE MATERIALIZED VIEW IF NOT EXISTS daily_uptime
        WITH (timescaledb.continuous) AS
        SELECT
          monitor_id,
          time_bucket('1 day', time) AS bucket,
          COUNT(*) AS total_checks,
          COUNT(*) FILTER (WHERE status = 'up') AS up_checks,
          AVG(response_time_ms) AS avg_response_time
        FROM check_results
        GROUP BY monitor_id, bucket
      `);
      console.log("[migrate] daily_uptime aggregate created");
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (msg.includes("already exists")) {
        console.log("[migrate] daily_uptime aggregate already exists");
      } else {
        console.warn("[migrate] Could not create daily_uptime:", msg);
      }
    }

    // Step 5: Retention policies
    console.log("[migrate] Setting up retention policies...");
    try {
      const retentionDays = getRetentionDays();

      // add_retention_policy's if_not_exists only skips creation when a
      // policy already exists — it does NOT update the interval on one
      // that does. Older installs (and any fresh install before this fix)
      // got a policy hardcoded to 30 days regardless of
      // DATA_RETENTION_DAYS, so if_not_exists alone would leave them stuck
      // at 30 days forever. Compare the existing policy's interval (if
      // any) against the configured retention window and only drop +
      // recreate it on a mismatch.
      const existing = await db.execute<{ job_id: number; drop_after: string | null }>(sql`
        SELECT job_id, config ->> 'drop_after' AS drop_after
        FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention'
          AND hypertable_name = 'check_results'
      `);

      let matches = false;
      if (existing.length > 0 && existing[0].drop_after) {
        const cmp = await db.execute<{ matches: boolean }>(sql`
          SELECT (${existing[0].drop_after}::interval = (INTERVAL '1 day' * ${retentionDays})) AS matches
        `);
        matches = Boolean(cmp[0]?.matches);
      }

      if (existing.length > 0 && !matches) {
        console.log(
          `[migrate] Existing check_results retention policy (${existing[0].drop_after}) doesn't match DATA_RETENTION_DAYS=${retentionDays}d; replacing`
        );
        await db.execute(sql`SELECT remove_retention_policy('check_results', if_exists => TRUE)`);
      }

      if (existing.length === 0 || !matches) {
        await db.execute(
          sql`SELECT add_retention_policy('check_results', INTERVAL '1 day' * ${retentionDays}, if_not_exists => TRUE)`
        );
        console.log(`[migrate] check_results retention policy set (${retentionDays} days)`);
      } else {
        console.log(`[migrate] check_results retention policy already matches DATA_RETENTION_DAYS=${retentionDays}d`);
      }
    } catch (e: unknown) {
      console.warn("[migrate] Retention policy note:", errorMessage(e));
    }

    try {
      await db.execute(
        sql`SELECT add_retention_policy('hourly_uptime', INTERVAL '1 year', if_not_exists => TRUE)`
      );
      console.log("[migrate] hourly_uptime retention policy set (1 year)");
    } catch (e: unknown) {
      console.warn("[migrate] Retention policy note:", errorMessage(e));
    }

    // Step 6: Compression policy for check_results
    console.log("[migrate] Setting up compression policy...");
    try {
      await db.execute(sql`
        ALTER TABLE check_results SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'monitor_id'
        )
      `);
      await db.execute(
        sql`SELECT add_compression_policy('check_results', INTERVAL '7 days', if_not_exists => TRUE)`
      );
      console.log("[migrate] check_results compression policy set (7 days)");
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (msg.includes("already enabled") || msg.includes("already exists")) {
        console.log("[migrate] Compression already configured");
      } else {
        console.warn("[migrate] Compression policy note:", msg);
      }
    }

  } else {
    console.log("[migrate] Skipping hypertable, aggregates, retention and compression (no TimescaleDB)");
  }

  // Step 7: Scheduling index for monitors
  console.log("[migrate] Creating scheduling index...");
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_monitors_scheduling
      ON monitors (is_paused, last_checked_at, interval_seconds)
      WHERE is_paused = false
    `);
    console.log("[migrate] Scheduling index created");
  } catch (e: unknown) {
    const msg = errorMessage(e);
    if (msg.includes("already exists")) {
      console.log("[migrate] Scheduling index already exists");
    } else {
      console.warn("[migrate] Scheduling index note:", msg);
    }
  }

  // Step 8: Per-monitor history index. Timescale chunks make "latest results
  // for a monitor" cheap; on plain PostgreSQL this index does the same job.
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time
      ON check_results (monitor_id, time DESC)
    `);
    console.log("[migrate] Monitor history index created");
  } catch (e: unknown) {
    console.warn("[migrate] Monitor history index note:", errorMessage(e));
  }

  console.log("[migrate] Migration complete!");
  await migrationClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
