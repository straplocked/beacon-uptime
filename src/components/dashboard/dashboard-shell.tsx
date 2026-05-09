"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  ChevronsUpDown,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BeaconMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { edition } from "@/lib/edition";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; plan: string };
  role: string;
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  kbd?: string;
}

// Proposed IA per docs/design/handoff-2026-q2.md §4.
// Incidents promoted above Monitors. Notifications nests under Settings.
const NAV: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, kbd: "G D" },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle, kbd: "G I" },
  { name: "Monitors", href: "/monitors", icon: BarChart3, kbd: "G M" },
  { name: "Status Pages", href: "/status-pages", icon: Globe, kbd: "G S" },
  { name: "Settings", href: "/settings", icon: Settings },
];

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/monitors": "Monitors",
  "/incidents": "Incidents",
  "/status-pages": "Status Pages",
  "/notifications": "Notifications",
  "/settings": "Settings",
};

function currentSection(pathname: string): NavItem | undefined {
  return NAV.find((item) => pathname.startsWith(item.href));
}

function currentLabel(pathname: string): string {
  // Pick the longest matching prefix for nicer breadcrumbs on detail routes.
  const match = Object.keys(ROUTE_LABELS)
    .filter((p) => pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : "Dashboard";
}

export function DashboardShell({
  user,
  organization,
  role: _role,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [orgs, setOrgs] = useState<
    Array<{ id: string; name: string; plan: string; role: string }>
  >([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const orgInitials = useMemo(
    () =>
      organization.name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    [organization.name],
  );
  const userInitial = user.name?.[0]?.toUpperCase() ?? "?";

  // Apply theme on the html root and persist.
  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem("beacon-theme") as "dark" | "light" | null)
        : null;
    const initial: "dark" | "light" =
      stored ??
      (typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    setTheme(initial);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (typeof window !== "undefined") {
      localStorage.setItem("beacon-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (orgSwitcherOpen && orgs.length === 0) {
      fetch("/api/internal/organizations")
        .then((r) => r.json())
        .then((data) => setOrgs(data.organizations || []))
        .catch(() => {});
    }
  }, [orgSwitcherOpen, orgs.length]);

  // Cmd-K trigger — placeholder. Real palette ships in a later sprint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // No-op for now. The trigger button is visible so users know it's coming.
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSwitchOrg(orgId: string) {
    await fetch(`/api/internal/organizations/${orgId}/switch`, {
      method: "POST",
    });
    setOrgSwitcherOpen(false);
    router.refresh();
  }

  const activeSection = currentSection(pathname);
  const breadcrumbLabel = currentLabel(pathname);

  return (
    <div className="min-h-screen bg-background text-foreground beacon-app">
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-150 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "w-[var(--side-w)]",
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 h-14 px-4 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-primary"><BeaconMark size={22} /></span>
            <span className="font-display font-bold text-[13px] tracking-[0.18em] text-foreground">
              BEACON
            </span>
          </Link>
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Org pill */}
        <div className="px-3 pt-3">
          {edition.showOrgSwitcher ? (
            <button
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md border border-sidebar-border bg-card hover:bg-muted transition-colors"
              onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
            >
              <span
                className="flex items-center justify-center w-[18px] h-[18px] rounded text-[10px] font-bold text-primary-foreground"
                style={{
                  background:
                    "linear-gradient(135deg, var(--primary), oklch(0.55 0.18 260))",
                }}
              >
                {orgInitials}
              </span>
              <span className="flex flex-col leading-[1.15] min-w-0 text-left">
                <span className="font-medium text-[12px] truncate">
                  {organization.name}
                </span>
                <span className="text-[10.5px] text-muted-foreground capitalize">
                  {organization.plan} · plan
                </span>
              </span>
              <ChevronsUpDown className="ml-auto h-3 w-3 opacity-50 shrink-0" />
            </button>
          ) : (
            <div className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md border border-sidebar-border bg-card">
              <span
                className="flex items-center justify-center w-[18px] h-[18px] rounded text-[10px] font-bold text-primary-foreground"
                style={{
                  background:
                    "linear-gradient(135deg, var(--primary), oklch(0.55 0.18 260))",
                }}
              >
                {orgInitials}
              </span>
              <span className="flex flex-col leading-[1.15] min-w-0">
                <span className="font-medium text-[12px] truncate">
                  {organization.name}
                </span>
                <span className="text-[10.5px] text-muted-foreground capitalize">
                  {organization.plan} · plan
                </span>
              </span>
            </div>
          )}

          {orgSwitcherOpen && edition.showOrgSwitcher && (
            <div className="mt-1 border border-border rounded-md bg-popover shadow-md">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                    org.id === organization.id && "bg-muted font-medium",
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-left truncate">{org.name}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {org.plan}
                  </span>
                </button>
              ))}
              {edition.showTeamManagement && (
                <Link
                  href="/settings/members"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors border-t border-border"
                  onClick={() => setOrgSwitcherOpen(false)}
                >
                  <Users className="h-3.5 w-3.5" />
                  Manage team
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-px">
          {NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center gap-2.5 h-[30px] px-2.5 rounded-md text-[13px] font-normal text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive &&
                    "bg-sidebar-accent text-foreground font-medium",
                )}
              >
                <Icon
                  className={cn(
                    "h-[15px] w-[15px] opacity-85 shrink-0",
                    isActive && "text-primary opacity-100",
                  )}
                />
                <span className="flex-1 truncate">{item.name}</span>
                {item.kbd && (
                  <span className="font-mono text-[10px] text-muted-foreground border border-border rounded px-1 py-px bg-card">
                    {item.kbd}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Foot */}
        <div className="border-t border-sidebar-border p-2.5 flex flex-col gap-2">
          <button
            className="flex items-center gap-2 h-[30px] px-2 rounded-md border border-border bg-card text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Search (coming soon)"
            title="Command palette — coming soon"
          >
            <Search className="h-3 w-3" />
            <span className="flex-1 text-left truncate">Search or jump…</span>
            <span className="font-mono text-[10px] border border-border rounded px-1 py-px bg-background">
              ⌘K
            </span>
          </button>
          <div className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-primary-foreground"
              style={{
                background:
                  "linear-gradient(135deg, var(--primary), oklch(0.55 0.18 280))",
              }}
            >
              {userInitial}
            </span>
            <div className="flex flex-col min-w-0 flex-1 leading-tight">
              <span className="text-[12px] font-medium truncate">
                {user.name}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                {user.email}
              </span>
            </div>
            <span
              className="ml-auto rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "var(--status-up)",
                boxShadow: "0 0 0 3px var(--status-up-soft)",
              }}
              title="Realtime connection"
              aria-label="Realtime connected"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-[var(--side-w)] flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center h-14 px-4 border-b border-border bg-background gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-primary">
            <BeaconMark size={20} />
          </span>
          <span className="font-display font-bold text-[12px] tracking-[0.18em]">
            BEACON
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="w-7 h-7 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </header>

        {/* Desktop top bar (breadcrumb + theme toggle) */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center h-14 px-6 border-b border-border bg-background gap-4">
          <nav
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
            aria-label="Breadcrumb"
          >
            <span>{organization.name}</span>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-foreground font-medium">
              {breadcrumbLabel}
            </span>
          </nav>
          <div className="flex-1" />
          <button
            className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border bg-card text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Command palette — coming soon"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <span className="font-mono text-[10px] border border-border rounded px-1 py-px bg-background ml-1">
              ⌘K
            </span>
          </button>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="w-7 h-7 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </header>

        <main id="main" className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

