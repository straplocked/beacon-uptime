"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BillingSectionProps {
  plan: string;
  stripeCustomerId: string | null;
}

const planDetails: Record<string, { name: string; price: string }> = {
  free: { name: "Free", price: "$0/mo" },
  pro: { name: "Pro", price: "$12/mo" },
  team: { name: "Team", price: "$29/mo" },
};

export function BillingSection({ plan, stripeCustomerId }: BillingSectionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleUpgrade(targetPlan: "pro" | "team") {
    setError("");
    setLoading(targetPlan);

    try {
      const res = await fetch("/api/internal/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start checkout");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setError("");
    setLoading("manage");

    try {
      const res = await fetch("/api/internal/billing/portal", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to open billing portal");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="text-lg font-semibold">
              {planDetails[plan]?.name || plan}{" "}
              <span className="text-muted-foreground font-normal text-sm">
                {planDetails[plan]?.price}
              </span>
            </p>
          </div>
          <Badge variant="secondary" className="capitalize">
            {plan}
          </Badge>
        </div>

        {plan === "free" ? (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold">Pro</p>
              <p className="text-2xl font-bold">
                $12<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>25 monitors</li>
                <li>1-min check interval</li>
                <li>3 status pages</li>
                <li>Custom domains</li>
                <li>API access</li>
              </ul>
              <Button
                onClick={() => handleUpgrade("pro")}
                disabled={loading !== null}
                className="w-full"
              >
                {loading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
              </Button>
            </div>
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold">Team</p>
              <p className="text-2xl font-bold">
                $29<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>100 monitors</li>
                <li>30-sec check interval</li>
                <li>10 status pages</li>
                <li>5 team members</li>
                <li>1-year data retention</li>
              </ul>
              <Button
                onClick={() => handleUpgrade("team")}
                disabled={loading !== null}
                className="w-full"
              >
                {loading === "team" ? "Redirecting..." : "Upgrade to Team"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <Button
              onClick={handleManage}
              disabled={loading !== null}
              variant="outline"
            >
              {loading === "manage"
                ? "Redirecting..."
                : "Manage Subscription"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
