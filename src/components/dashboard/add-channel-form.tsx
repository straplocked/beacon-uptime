"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

export function AddChannelForm() {
  const router = useRouter();
  const [type, setType] = useState("email");

  function handleTypeChange(value: string | null) {
    if (value) setType(value);
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;

    const config: Record<string, string> = {};
    if (type === "email") {
      config.email = formData.get("value") as string;
    } else {
      config.webhook_url = formData.get("value") as string;
    }

    try {
      const res = await fetch("/api/internal/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, config }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create channel");
        return;
      }

      router.refresh();
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const valuePlaceholder: Record<string, string> = {
    email: "alerts@example.com",
    slack: "https://hooks.slack.com/services/...",
    discord: "https://discord.com/api/webhooks/...",
    webhook: "https://example.com/webhook",
  };

  const valueLabel: Record<string, string> = {
    email: "Email Address",
    slack: "Webhook URL",
    discord: "Webhook URL",
    webhook: "Webhook URL",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Notification Channel</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Channel Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Team Alerts"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">{valueLabel[type]}</Label>
            <Input
              id="value"
              name="value"
              type={type === "email" ? "email" : "url"}
              placeholder={valuePlaceholder[type]}
              required
            />
          </div>

          <Button type="submit" disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            {loading ? "Adding..." : "Add Channel"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
