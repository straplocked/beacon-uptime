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
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewMonitorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("http");

  function handleTypeChange(value: string | null) {
    if (value) setType(value);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const body: Record<string, unknown> = {
      name: formData.get("name"),
      type,
      target: formData.get("target"),
      intervalSeconds: parseInt(formData.get("interval") as string) || 60,
      timeoutMs: parseInt(formData.get("timeout") as string) || 10000,
    };

    if (type === "http") {
      body.method = formData.get("method") || "GET";
      body.expectedStatusCode = parseInt(formData.get("expectedStatus") as string) || 200;
    }

    try {
      const res = await fetch("/api/internal/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create monitor");
        return;
      }

      router.push(`/monitors/${data.monitor.id}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const targetPlaceholder: Record<string, string> = {
    http: "https://example.com",
    ping: "example.com or 1.2.3.4",
    tcp: "example.com:5432",
    dns: "example.com",
    ssl: "example.com",
    heartbeat: "My Cron Job",
  };

  const targetLabel: Record<string, string> = {
    http: "URL",
    ping: "Host / IP",
    tcp: "Host:Port",
    dns: "Hostname",
    ssl: "Hostname",
    heartbeat: "Description",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/monitors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Monitor</h1>
          <p className="text-muted-foreground">
            Set up a new uptime check
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Monitor Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="My Website"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Monitor Type</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP(S)</SelectItem>
                  <SelectItem value="ping">Ping (ICMP)</SelectItem>
                  <SelectItem value="tcp">TCP Port</SelectItem>
                  <SelectItem value="dns">DNS</SelectItem>
                  <SelectItem value="ssl">SSL Certificate</SelectItem>
                  <SelectItem value="heartbeat">Heartbeat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">{targetLabel[type] || "Target"}</Label>
              <Input
                id="target"
                name="target"
                placeholder={targetPlaceholder[type]}
                required
              />
            </div>

            {type === "http" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>HTTP Method</Label>
                  <Select name="method" defaultValue="GET">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="HEAD">HEAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expectedStatus">Expected Status Code</Label>
                  <Input
                    id="expectedStatus"
                    name="expectedStatus"
                    type="number"
                    defaultValue="200"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Check Interval (seconds)</Label>
                <Input
                  id="interval"
                  name="interval"
                  type="number"
                  defaultValue="60"
                  min="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (ms)</Label>
                <Input
                  id="timeout"
                  name="timeout"
                  type="number"
                  defaultValue="10000"
                  min="1000"
                  max="60000"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Monitor"}
              </Button>
              <Link href="/monitors">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
