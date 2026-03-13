import { getAuthContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { BillingSection } from "@/components/dashboard/billing-section";
import { ApiKeySection } from "@/components/dashboard/api-key-section";
import { edition } from "@/lib/edition";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const plan = ctx.organization.plan as PlanType;
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and organization</p>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{ctx.user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{ctx.user.email}</span>
          </div>
        </CardContent>
      </Card>

      {/* Organization info */}
      {edition.showOrgSwitcher && (
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">{ctx.organization.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <Badge variant="secondary" className="capitalize">
                {ctx.organization.plan}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Your Role</span>
              <span className="text-sm font-medium capitalize">{ctx.role}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan limits */}
      {edition.enforcePlanLimits && (
        <Card>
          <CardHeader>
            <CardTitle>Plan Limits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Monitors</p>
                <p className="font-medium">{limits.monitors}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Check Interval</p>
                <p className="font-medium">{limits.checkIntervalSeconds}s min</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status Pages</p>
                <p className="font-medium">{limits.statusPages}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Data Retention</p>
                <p className="font-medium">{limits.dataRetentionDays} days</p>
              </div>
              <div>
                <p className="text-muted-foreground">Custom Domain</p>
                <p className="font-medium">{limits.customDomain ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Team Members</p>
                <p className="font-medium">{limits.teamMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Key */}
      <ApiKeySection
        hasApiKey={!!ctx.organization.apiKey}
        canUseApi={limits.apiAccess}
      />

      {/* Billing */}
      {edition.showBilling && (
        <BillingSection
          plan={ctx.organization.plan}
          stripeCustomerId={ctx.organization.stripeCustomerId}
        />
      )}
    </div>
  );
}
