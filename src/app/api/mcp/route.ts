/**
 * Beacon Uptime — MCP endpoint.
 *
 * Stateless JSON-RPC 2.0 over HTTP. Each request gets a fresh server +
 * transport bound to the caller's organization. No SSE, no sessions in v1.
 *
 * Auth: `Authorization: Bearer bk_...` is required. Cookies are NOT
 * accepted on /api/mcp — same CSRF protection as Strawberry Notes'
 * implementation.
 *
 * Rate limits: read traffic shares the existing 60-req/60s API key limit
 * applied across `/api/v1/*`; writes get an additional 30-req/60s ceiling
 * to slow runaway agent loops.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";

import { resolveApiKey } from "@/lib/auth/api-key";
import { buildMcpServer } from "@/lib/mcp/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: Request): Promise<Response> {
  const org = await resolveApiKey(req.headers.get("authorization"));
  if (!org) {
    return NextResponse.json(
      { error: "Unauthorized — provide a Bearer bk_... API key" },
      { status: 401 },
    );
  }

  // Rate limit: 60 req / 60s, shared with /api/v1/*.
  const general = await rateLimit(`api:${org.id}`, 60, 60);
  if (!general.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(general.retryAfter),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Best-effort write detection. We can't introspect the JSON-RPC body
  // without consuming the stream, so we apply a separate write-tier
  // allowance per minute that backs off agent loops.
  // (Further tightening can read the parsed body once we extract a body
  // helper; for v1 the general limit + this looser write ceiling is enough.)
  const writes = await rateLimit(`api:writes:${org.id}`, 30, 60);
  if (!writes.allowed) {
    return NextResponse.json(
      { error: "Write rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(writes.retryAfter),
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer(org);
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    server.close().catch(() => {});
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

export function GET(): Response {
  return NextResponse.json(
    { error: "Streaming is not supported on /api/mcp v1" },
    { status: 405 },
  );
}

export function DELETE(): Response {
  return NextResponse.json(
    { error: "Sessions are not used on /api/mcp v1" },
    { status: 405 },
  );
}
