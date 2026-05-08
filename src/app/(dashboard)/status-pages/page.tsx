/**
 * P-SP-LIST — Status pages list.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-SP-LIST).
 * Token-driven row layout. Each row shows brand-color tile, slug,
 * custom domain (if set), monitor count, public/private state,
 * and quick actions to view + edit.
 */

import { count, desc, eq, sql } from "drizzle-orm";
import { ExternalLink, Globe, Plus } from "lucide-react";
import Link from "next/link";

import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { statusPageMonitors, statusPages } from "@/lib/db/schema";

export default async function StatusPagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const rows = await db
    .select({
      id: statusPages.id,
      name: statusPages.name,
      slug: statusPages.slug,
      customDomain: statusPages.customDomain,
      logoUrl: statusPages.logoUrl,
      brandColor: statusPages.brandColor,
      theme: statusPages.theme,
      isPublic: statusPages.isPublic,
      createdAt: statusPages.createdAt,
      monitorCount: sql<number>`(
        select count(*)::int
        from ${statusPageMonitors}
        where ${statusPageMonitors.statusPageId} = ${statusPages.id}
      )`,
    })
    .from(statusPages)
    .where(eq(statusPages.organizationId, ctx.organization.id))
    .orderBy(desc(statusPages.createdAt));

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
            Status pages
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Public pages showing the status of your services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/status-pages/new"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            New status page
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-lg text-center py-16 px-4">
          <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-60" />
          <p className="font-medium text-[14px]">No status pages yet</p>
          <p className="text-[12px] text-muted-foreground mt-1 mb-4">
            Create a public page so your users can see your service health.
          </p>
          <Link
            href="/status-pages/new"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95"
          >
            <Plus className="h-3 w-3" />
            Create status page
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {rows.map((p, i) => (
            <div
              key={p.id}
              className={
                "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 " +
                (i < rows.length - 1 ? "border-b border-border" : "")
              }
            >
              {/* Brand tile */}
              <div
                className="flex items-center justify-center w-10 h-10 rounded-md text-white font-semibold shrink-0"
                style={{
                  background: p.brandColor || "var(--primary)",
                }}
                aria-hidden
              >
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-[13.5px] text-foreground truncate">
                    {p.name}
                  </span>
                  <span
                    className="inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider"
                    style={{
                      background: p.isPublic
                        ? "var(--status-up-soft)"
                        : "var(--status-paused-soft)",
                      color: p.isPublic
                        ? "var(--status-up)"
                        : "var(--status-paused)",
                    }}
                  >
                    {p.isPublic ? "Public" : "Private"}
                  </span>
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {p.theme}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-muted-foreground flex-wrap">
                  <span className="font-mono">/s/{p.slug}</span>
                  {p.customDomain && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{p.customDomain}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>
                    {p.monitorCount} monitor
                    {p.monitorCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={`/s/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="View public page"
                  title="View public page"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <Link
                  href={`/status-pages/${p.id}/edit`}
                  className="inline-flex items-center h-7 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium hover:bg-muted transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
