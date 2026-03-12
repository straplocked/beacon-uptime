import { redis } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowKey = `rate:${key}`;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(windowKey, 0, now - windowMs);
  pipeline.zadd(windowKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(windowKey);
  pipeline.expire(windowKey, windowSeconds + 1);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;

  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  return { allowed, remaining, retryAfter: allowed ? 0 : windowSeconds };
}

export async function withRateLimit(
  request: NextRequest,
  identifier: string,
  limit: number = 60,
  windowSeconds: number = 60
): Promise<NextResponse | null> {
  const result = await rateLimit(identifier, limit, windowSeconds);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
