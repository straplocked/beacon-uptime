/**
 * P-SETTINGS subroute — Members.
 *
 * In the OSS edition this is an upgrade-prompt placeholder. The real
 * team-management UI restores in the SaaS overlay (premium edition)
 * once the multi-user routes are wired back per the OSS/SaaS split
 * documented in src/lib/edition.ts.
 */

import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";

export default function MembersPage() {
  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[820px] mx-auto w-full">
      <nav
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-3"
        aria-label="Breadcrumb"
      >
        <Link
          href="/settings"
          className="hover:text-foreground transition-colors"
        >
          Settings
        </Link>
        <ChevronRight className="h-3 w-3 opacity-50" />
        <span className="text-foreground font-medium">Members</span>
      </nav>

      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
          Team members
        </h1>
        <p className="text-muted-foreground text-[13px] mt-1">
          Invite teammates and manage their access
        </p>
      </div>

      <section className="bg-card border border-border rounded-lg p-6 text-center">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-md mb-3"
          style={{
            background: "oklch(from var(--primary) l c h / 0.10)",
            color: "var(--primary)",
          }}
          aria-hidden
        >
          <Users className="h-5 w-5" />
        </div>
        <h2 className="m-0 mb-1 text-[15px] font-semibold tracking-[-0.005em]">
          Available on Beacon Cloud
        </h2>
        <p className="text-[12.5px] text-muted-foreground mx-auto max-w-[420px] mb-4">
          Team management with invitations, role-based access control, and
          per-member API keys is available in the SaaS edition.
        </p>
        <a
          href="https://beacon.pluginsynthesis.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95 transition-opacity"
        >
          Visit Beacon Cloud
          <ChevronRight className="h-3 w-3" />
        </a>
      </section>
    </div>
  );
}
