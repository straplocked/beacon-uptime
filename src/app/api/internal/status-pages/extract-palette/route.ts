/**
 * POST /api/internal/status-pages/extract-palette
 *
 * Sprint 6 / Differentiator #2 — auto-branded status pages.
 *
 * Takes a URL (a site, a page, or a direct image), fetches its favicon /
 * logo server-side through the SSRF-guarded fetcher, and returns a brand
 * palette + a suggested status-page theme. The Branding tab of the status
 * page editor calls this; nothing is persisted here.
 *
 * Fetching a user-controlled URL from the server is the risky part — see
 * src/lib/net/safe-fetch.ts for the guard. This route adds a tight rate
 * limit on top since each call makes outbound requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth";
import { canEditResources } from "@/lib/auth/permissions";
import { extractFromUrl } from "@/lib/color/favicon";
import { SafeFetchError } from "@/lib/net/safe-fetch";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(1).max(2048),
});

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditResources(ctx.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  // Outbound network I/O — keep it modest per org. 10 extractions/min is
  // plenty for a human tuning a status page, and slows any abuse.
  const limited = await rateLimit(`extract-palette:${ctx.organization.id}`, 10, 60);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many extraction requests — try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfter) },
      },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  }

  try {
    const result = await extractFromUrl(parsed.url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SafeFetchError) {
      // 4xx for the caller's mistakes (bad/blocked URL, wrong type), not a 5xx.
      const status =
        err.code === "blocked_host" || err.code === "invalid_url" ? 400 : 422;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not extract a palette from that URL.",
      },
      { status: 422 },
    );
  }
}
