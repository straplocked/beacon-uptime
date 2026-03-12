"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface StatusPageOption {
  id: string;
  name: string;
  slug: string;
}

export default function NewIncidentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusPages, setStatusPages] = useState<StatusPageOption[]>([]);
  const [statusPageId, setStatusPageId] = useState("");
  const [status, setStatus] = useState("investigating");
  const [impact, setImpact] = useState("minor");

  useEffect(() => {
    fetch("/api/internal/status-pages")
      .then((res) => res.json())
      .then((data) => {
        setStatusPages(data.statusPages || []);
        if (data.statusPages?.length === 1) {
          setStatusPageId(data.statusPages[0].id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const body = {
      statusPageId,
      title: formData.get("title") as string,
      status,
      impact,
      message: formData.get("message") as string,
    };

    try {
      const res = await fetch("/api/internal/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create incident");
        return;
      }

      router.push(`/incidents/${data.incident.id}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/incidents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Incident</h1>
          <p className="text-muted-foreground">
            Report a new incident on a status page
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
              <Label>Status Page</Label>
              {statusPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No status pages found.{" "}
                  <Link
                    href="/status-pages/new"
                    className="underline"
                  >
                    Create one first
                  </Link>
                  .
                </p>
              ) : (
                <Select
                  value={statusPageId}
                  onValueChange={(v) => v && setStatusPageId(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a status page" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusPages.map((page) => (
                      <SelectItem key={page.id} value={page.id}>
                        {page.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Incident Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="API Degraded Performance"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => v && setStatus(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="identified">Identified</SelectItem>
                    <SelectItem value="monitoring">Monitoring</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Impact</Label>
                <Select
                  value={impact}
                  onValueChange={(v) => v && setImpact(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Initial Update Message</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="We are investigating elevated error rates..."
                rows={4}
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading || !statusPageId}>
                {loading ? "Creating..." : "Create Incident"}
              </Button>
              <Link href="/incidents">
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
