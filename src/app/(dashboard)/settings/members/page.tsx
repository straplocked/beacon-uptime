/**
 * P-SETTINGS subroute — Members.
 *
 * Multi-tenancy is core to Beacon: every monitor, status page, incident and
 * notification channel hangs off `organization_id`, and the owner/admin/
 * member/viewer roles in `organization_members` are enforced server-side by
 * src/lib/auth/permissions.ts.
 *
 * What does NOT exist yet is the invite/management UI — there are no
 * /api/internal/members routes. Until those land, memberships are created
 * directly in the database. This page says exactly that rather than pointing
 * at a paid tier.
 */

import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";

const ROLES: Array<{ name: string; description: string }> = [
  { name: "Owner", description: "Full access, including deleting the organization." },
  { name: "Admin", description: "Manage members, monitors, status pages and incidents." },
  { name: "Member", description: "Create and edit monitors, status pages and incidents." },
  { name: "Viewer", description: "Read-only access to the dashboard." },
];

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
          Roles and access for this organization
        </p>
      </div>

      <section className="bg-card border border-border rounded-lg p-6">
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
          Invite UI not built yet
        </h2>
        <p className="text-[12.5px] text-muted-foreground max-w-[460px] mb-4">
          Organizations support unlimited members and Beacon already enforces
          the four roles below on every request. The invitation and member
          listing screens are still to be built, so for now memberships are
          added directly in the <code className="font-mono">organization_members</code>{" "}
          table.
        </p>

        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {ROLES.map((r) => (
            <li
              key={r.name}
              className="flex items-baseline gap-2 text-[12.5px] border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <span className="font-medium min-w-[64px]">{r.name}</span>
              <span className="text-muted-foreground">{r.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
