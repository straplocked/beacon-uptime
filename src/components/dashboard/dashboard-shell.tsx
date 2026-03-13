"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  Globe,
  LayoutDashboard,
  AlertTriangle,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  Users,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { edition } from "@/lib/edition";

interface DashboardShellProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    plan: string;
  };
  role: string;
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Monitors", href: "/monitors", icon: BarChart3 },
  { name: "Status Pages", href: "/status-pages", icon: Globe },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function DashboardShell({ user, organization, role, children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; plan: string; role: string }>>([]);

  useEffect(() => {
    if (orgSwitcherOpen && orgs.length === 0) {
      fetch("/api/internal/organizations")
        .then((r) => r.json())
        .then((data) => setOrgs(data.organizations || []))
        .catch(() => {});
    }
  }, [orgSwitcherOpen, orgs.length]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSwitchOrg(orgId: string) {
    await fetch(`/api/internal/organizations/${orgId}/switch`, { method: "POST" });
    setOrgSwitcherOpen(false);
    router.refresh();
  }

  const planColors: Record<string, string> = {
    free: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    pro: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    team: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r transform transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b">
            <Link href="/" className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="font-extrabold text-lg uppercase tracking-wider font-display">BEACON</span>
            </Link>
            <button
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Org Switcher */}
          {edition.showOrgSwitcher && (
            <div className="px-3 pt-3">
              <button
                onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md border bg-background hover:bg-muted transition-colors"
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-left truncate font-medium">{organization.name}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {orgSwitcherOpen && (
                <div className="mt-1 border rounded-md bg-background shadow-lg">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleSwitchOrg(org.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                        org.id === organization.id && "bg-muted font-medium"
                      )}
                    >
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 text-left truncate">{org.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] capitalize", planColors[org.plan])}
                      >
                        {org.plan}
                      </Badge>
                    </button>
                  ))}
                  {edition.showTeamManagement && (
                    <Link
                      href="/settings/members"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors border-t"
                      onClick={() => setOrgSwitcherOpen(false)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Manage team
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nav links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                    isActive
                      ? "bg-muted text-foreground font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              {edition.enforcePlanLimits && (
                <Badge
                  variant="secondary"
                  className={cn("text-xs capitalize", planColors[organization.plan])}
                >
                  {organization.plan}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center h-16 px-4 border-b bg-background lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 ml-4">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-extrabold uppercase tracking-wider font-display">BEACON</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
