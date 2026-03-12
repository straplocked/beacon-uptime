import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { BillingSection } from "@/components/dashboard/billing-section";
import { ApiKeySection } from "@/components/dashboard/api-key-section";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const plan = user.plan as PlanType;
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account</p>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Plan</span>
            <Badge variant="secondary" className="capitalize">
              {user.plan}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Plan limits */}
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
              <p className="text-muted-foreground">API Access</p>
              <p className="font-medium">{limits.apiAccess ? "Yes" : "No"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <ApiKeySection
        hasApiKey={!!user.apiKey}
        canUseApi={limits.apiAccess}
      />

      {/* Billing */}
      <BillingSection
        plan={user.plan}
        stripeCustomerId={user.stripeCustomerId}
      />
    </div>
  );
}
