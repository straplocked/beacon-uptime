import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect("/login");
  }

  return (
    <DashboardShell
      user={{ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email }}
      organization={{ id: ctx.organization.id, name: ctx.organization.name, plan: ctx.organization.plan }}
      role={ctx.role}
    >
      {children}
    </DashboardShell>
  );
}
