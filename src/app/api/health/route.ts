import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const health: { status: string; db: boolean; redis: boolean } = {
    status: "ok",
    db: false,
    redis: false,
  };

  // Check database
  try {
    await db.execute(sql`SELECT 1`);
    health.db = true;
  } catch {
    health.status = "degraded";
  }

  // Check Redis (via BullMQ connection test)
  try {
    const { default: IORedis } = await import("ioredis");
    const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6380", {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
    });
    await redis.ping();
    await redis.quit();
    health.redis = true;
  } catch {
    health.status = "degraded";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
