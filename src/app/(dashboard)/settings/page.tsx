/**
 * P-SETTINGS — Settings page (visual rebuild).
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-SETTINGS).
 * Sections: Profile, Organization, API keys & MCP, Notifications, Members.
 * Each section is a card with token-driven chrome and tighter density.
 *
 * NOTE: The Notifications IA shift (subsume /notifications under Settings)
 * is deferred until Sprint 5; for now, a small "Notifications" section
 * links out to /notifications.
 */

import { Bell, ExternalLink, Key, Users } from "lucide-react";
import Link from "next/link";

import { ApiKeySection } from "@/components/dashboard/api-key-section";
import { getAuthContext } from "@/lib/auth";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3100";
  const mcpEndpoint = `${baseUrl.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[820px] mx-auto w-full">
      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
          Settings
        </h1>
        <p className="text-muted-foreground text-[13px] mt-1">
          Manage your account, organization, and integrations
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Profile */}
        <Section title="Profile">
          <KeyValueRow label="Name" value={ctx.user.name} />
          <KeyValueRow label="Email" value={ctx.user.email} mono />
          <KeyValueRow
            label="Your role"
            value={ctx.role}
            valueClassName="capitalize"
          />
        </Section>

        {/* Organization */}
        <Section title="Organization">
          <KeyValueRow label="Name" value={ctx.organization.name} />
        </Section>

        {/* API keys & MCP */}
        <Section
          title="API keys & MCP"
          subtitle="Connect agents and external tools"
          icon={<Key className="h-3.5 w-3.5" />}
        >
          {/* MCP info panel */}
          <div
            className="rounded-md border p-3 mb-3"
            style={{
              background:
                "linear-gradient(180deg, oklch(from var(--primary) l c h / 0.06), transparent)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-center gap-2 text-[12.5px] font-semibold mb-1.5">
              <span
                className="flex items-center justify-center w-[18px] h-[18px] rounded text-[10px] font-bold font-mono"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
                aria-hidden
              >
                M
              </span>
              MCP server
              <span
                className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium"
                style={{
                  color: ctx.organization.apiKey
                    ? "var(--status-up)"
                    : "var(--muted-foreground)",
                }}
              >
                <span
                  aria-hidden
                  className="rounded-full animate-pulse-dot"
                  style={{
                    width: 5,
                    height: 5,
                    background: ctx.organization.apiKey
                      ? "var(--status-up)"
                      : "var(--muted-foreground)",
                    boxShadow: ctx.organization.apiKey
                      ? "0 0 0 3px var(--status-up-soft)"
                      : undefined,
                  }}
                />
                {ctx.organization.apiKey ? "Available" : "Setup needed"}
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mb-2 leading-relaxed">
              Point Claude Desktop, Claude Code, Cursor, or any MCP client at
              your Beacon API key to manage monitors, query uptime, and
              acknowledge incidents from chat. {ctx.organization.apiKey
                ? "16 tools exposed."
                : "Generate an API key below to enable."}
            </p>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border bg-background font-mono text-[11px] overflow-hidden">
              <span className="text-muted-foreground">$</span>
              <span className="truncate">mcp-remote {mcpEndpoint}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Full reference:{" "}
              <Link
                href="/docs/MCP"
                className="text-primary hover:underline whitespace-nowrap"
              >
                docs/MCP.md →
              </Link>
            </p>
          </div>

          <ApiKeySection hasApiKey={!!ctx.organization.apiKey} />
        </Section>

        {/* Notifications (placeholder until IA shift in Sprint 5) */}
        <Section
          title="Notifications"
          subtitle="Channels that fire when monitors change state"
          icon={<Bell className="h-3.5 w-3.5" />}
        >
          <p className="text-[12.5px] text-muted-foreground mb-2">
            Configure email, Slack, Discord, and webhook channels. Each channel
            applies to all monitors by default.
          </p>
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium hover:bg-muted transition-colors"
          >
            Manage channels
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </Section>

        {/* Members */}
        <Section
          title="Members"
          subtitle="Unlimited members per organization"
          icon={<Users className="h-3.5 w-3.5" />}
        >
          <Link
            href="/settings/members"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium hover:bg-muted transition-colors"
          >
            Manage members
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </Section>
      </div>
    </div>
  );
}

/* ─── Section primitives ──────────────────────── */

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[11.5px] text-muted-foreground">
            · {subtitle}
          </span>
        )}
      </header>
      <div className="p-4 space-y-2">{children}</div>
    </section>
  );
}

function KeyValueRow({
  label,
  value,
  mono = false,
  valueClassName = "",
  valueBadge = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
  valueBadge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      {valueBadge ? (
        <span
          className={
            "inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-semibold uppercase tracking-wider " +
            valueClassName
          }
          style={{
            background: "var(--status-up-soft)",
            color: "var(--status-up)",
          }}
        >
          {value}
        </span>
      ) : (
        <span
          className={
            (mono ? "font-mono " : "font-medium ") +
            "text-foreground " +
            valueClassName
          }
        >
          {value}
        </span>
      )}
    </div>
  );
}
