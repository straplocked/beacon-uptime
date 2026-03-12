import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  // Step 1: Enable TimescaleDB extension (this may restart the DB connection)
  console.log("[migrate] Enabling TimescaleDB extension...");
  try {
    const extClient = postgres(databaseUrl, { max: 1 });
    const extDb = drizzle(extClient);
    await extDb.execute(sql`CREATE EXTENSION IF NOT EXISTS timescaledb`);
    await extClient.end();
    console.log("[migrate] TimescaleDB extension enabled");
  } catch (e: any) {
    // Connection reset is expected when extension loads for the first time
    const errMsg = String(e?.message || "") + String(e?.cause?.code || "");
    if (errMsg.includes("ECONNRESET") || errMsg.includes("connection reset")) {
      console.log("[migrate] TimescaleDB extension triggered server reload, waiting...");
      await sleep(5000);
    } else if (errMsg.includes("already loaded") || errMsg.includes("already exists")) {
      console.log("[migrate] TimescaleDB already loaded");
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

  // Step 3: Convert check_results to a hypertable
  console.log("[migrate] Setting up TimescaleDB hypertable...");
  try {
    await db.execute(
      sql`SELECT create_hypertable('check_results', 'time', if_not_exists => TRUE)`
    );
    console.log("[migrate] Hypertable created/verified");
  } catch (e: any) {
    if (e.message?.includes("already a hypertable")) {
      console.log("[migrate] check_results is already a hypertable");
    } else {
      console.warn("[migrate] Hypertable note:", e.message);
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
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("[migrate] hourly_uptime aggregate already exists");
    } else {
      console.warn("[migrate] Could not create hourly_uptime:", e.message);
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
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("[migrate] daily_uptime aggregate already exists");
    } else {
      console.warn("[migrate] Could not create daily_uptime:", e.message);
    }
  }

  // Step 5: Retention policies
  console.log("[migrate] Setting up retention policies...");
  try {
    await db.execute(
      sql`SELECT add_retention_policy('check_results', INTERVAL '30 days', if_not_exists => TRUE)`
    );
    console.log("[migrate] check_results retention policy set (30 days)");
  } catch (e: any) {
    console.warn("[migrate] Retention policy note:", e.message);
  }

  try {
    await db.execute(
      sql`SELECT add_retention_policy('hourly_uptime', INTERVAL '1 year', if_not_exists => TRUE)`
    );
    console.log("[migrate] hourly_uptime retention policy set (1 year)");
  } catch (e: any) {
    console.warn("[migrate] Retention policy note:", e.message);
  }

  console.log("[migrate] Migration complete!");
  await migrationClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
