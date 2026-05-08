/**
 * MCP server status / setup rail.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-DASH "MCP rail").
 *
 * For now this is purely informational — the MCP server itself ships in
 * Sprint 7. The visual presence here primes users on what's coming.
 */

import Link from "next/link";

export interface McpRailProps {
  /** True when the MCP server endpoint is up and reachable. */
  connected: boolean;
  /** Number of tools currently exposed. */
  toolCount: number;
  /** Last call timestamp, e.g. "2m ago". Null if never called. */
  lastCallAgo: string | null;
  /** The endpoint to surface in the snippet. */
  endpoint: string;
}

export function McpRail({
  connected,
  toolCount,
  lastCallAgo,
  endpoint,
}: McpRailProps) {
  return (
    <section
      className="rounded-lg border border-border p-3.5 mt-3"
      style={{
        background:
          "linear-gradient(180deg, oklch(from var(--primary) l c h / 0.06), transparent)",
      }}
      aria-label="MCP server"
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold">
        <span
          className="flex items-center justify-center w-[18px] h-[18px] rounded text-[10px] font-bold font-mono"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          M
        </span>
        <span>MCP server</span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium"
          style={{
            color: connected ? "var(--status-up)" : "var(--muted-foreground)",
          }}
        >
          <span
            aria-hidden
            className="rounded-full animate-pulse-dot"
            style={{
              width: 5,
              height: 5,
              background: connected
                ? "var(--status-up)"
                : "var(--muted-foreground)",
              boxShadow: connected
                ? "0 0 0 3px var(--status-up-soft)"
                : undefined,
            }}
          />
          {connected ? "Connected" : "Coming soon"}
        </span>
      </div>
      <p className="text-[11.5px] text-muted-foreground my-2 leading-relaxed">
        {connected ? (
          <>
            Claude is connected via your{" "}
            <code className="font-mono text-[11px]">bk_</code> API key.{" "}
            {toolCount} tool{toolCount === 1 ? "" : "s"} exposed.
            {lastCallAgo ? ` Last call ${lastCallAgo}.` : ""}
          </>
        ) : (
          <>
            Connect Claude Desktop, Claude Code, or any MCP client to manage
            monitors, query uptime, and acknowledge incidents from chat.{" "}
            <Link
              href="/settings"
              className="text-primary hover:underline whitespace-nowrap"
            >
              Get an API key →
            </Link>
          </>
        )}
      </p>
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border bg-background font-mono text-[11px] text-foreground overflow-hidden"
      >
        <span className="text-muted-foreground">$</span>
        <span className="truncate">mcp-remote {endpoint}</span>
        <span className="ml-auto text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-px font-mono">
          copy
        </span>
      </div>
    </section>
  );
}
