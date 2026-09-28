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
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import Link from "next/link";

type AssertionDraft =
  | { localId: string; type: "body_contains"; value: string }
  | { localId: string; type: "body_not_contains"; value: string }
  | { localId: string; type: "body_regex"; pattern: string }
  | { localId: string; type: "header_equals"; header: string; value: string }
  | { localId: string; type: "json_path_equals"; path: string; value: string };

function emptyAssertion(type: AssertionDraft["type"]): AssertionDraft {
  const localId = crypto.randomUUID();
  switch (type) {
    case "body_contains":
    case "body_not_contains":
      return { localId, type, value: "" };
    case "body_regex":
      return { localId, type, pattern: "" };
    case "header_equals":
      return { localId, type, header: "", value: "" };
    case "json_path_equals":
      return { localId, type, path: "", value: "" };
  }
}

const assertionTypeLabel: Record<AssertionDraft["type"], string> = {
  body_contains: "Body contains",
  body_not_contains: "Body does not contain",
  body_regex: "Body matches regex",
  header_equals: "Header equals",
  json_path_equals: "JSON path equals",
};

export default function NewMonitorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("http");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [assertions, setAssertions] = useState<AssertionDraft[]>([]);

  function handleTypeChange(value: string | null) {
    if (value) setType(value);
  }

  function addAssertion() {
    setAssertions((prev) => [...prev, emptyAssertion("body_contains")]);
  }

  function removeAssertion(localId: string) {
    setAssertions((prev) => prev.filter((a) => a.localId !== localId));
  }

  function changeAssertionType(localId: string, newType: AssertionDraft["type"]) {
    setAssertions((prev) =>
      prev.map((a) => (a.localId === localId ? emptyAssertion(newType) : a))
    );
  }

  function updateAssertionField(
    localId: string,
    field: string,
    value: string
  ) {
    setAssertions((prev) =>
      prev.map((a) =>
        a.localId === localId ? ({ ...a, [field]: value } as AssertionDraft) : a
      )
    );
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

    const confirmationCountRaw = formData.get("confirmationCount") as string;
    if (confirmationCountRaw) {
      body.confirmationCount = parseInt(confirmationCountRaw) || 2;
    }
    const retryIntervalRaw = formData.get("retryInterval") as string;
    if (retryIntervalRaw) {
      body.retryIntervalSeconds = parseInt(retryIntervalRaw) || 30;
    }

    if (type === "http" && assertions.length > 0) {
      body.assertions = assertions.map(({ localId, ...rest }) => {
        void localId;
        return rest;
      });
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

            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advanced
              </button>

              {showAdvanced && (
                <div className="space-y-6 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="confirmationCount">
                        Confirmations before alerting
                      </Label>
                      <Input
                        id="confirmationCount"
                        name="confirmationCount"
                        type="number"
                        defaultValue="2"
                        min="1"
                        max="10"
                      />
                      <p className="text-xs text-muted-foreground">
                        Consecutive failing checks required before the
                        monitor is marked down and an incident opens. 1 =
                        alert on the first failure (no flap protection).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retryInterval">
                        Retry interval (seconds)
                      </Label>
                      <Input
                        id="retryInterval"
                        name="retryInterval"
                        type="number"
                        defaultValue="30"
                        min="15"
                      />
                      <p className="text-xs text-muted-foreground">
                        How soon to re-check after a failure that hasn&apos;t
                        yet been confirmed, instead of waiting a full check
                        interval.
                      </p>
                    </div>
                  </div>

                  {type === "http" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Assertions</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Fail the check when the response doesn&apos;t
                            match. Evaluated only after the status code
                            already matches.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addAssertion}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add assertion
                        </Button>
                      </div>

                      {assertions.length > 0 && (
                        <div className="space-y-3">
                          {assertions.map((a) => (
                            <div
                              key={a.localId}
                              className="flex items-start gap-2 rounded-md border border-border p-3"
                            >
                              <div className="flex-1 space-y-2">
                                <Select
                                  value={a.type}
                                  onValueChange={(v) =>
                                    v &&
                                    changeAssertionType(
                                      a.localId,
                                      v as AssertionDraft["type"]
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      Object.keys(
                                        assertionTypeLabel
                                      ) as AssertionDraft["type"][]
                                    ).map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {assertionTypeLabel[t]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {(a.type === "body_contains" ||
                                  a.type === "body_not_contains") && (
                                  <Input
                                    placeholder="Text the body should (not) contain"
                                    value={a.value}
                                    onChange={(e) =>
                                      updateAssertionField(
                                        a.localId,
                                        "value",
                                        e.target.value
                                      )
                                    }
                                  />
                                )}

                                {a.type === "body_regex" && (
                                  <Input
                                    placeholder="Regex pattern (max 200 chars)"
                                    value={a.pattern}
                                    onChange={(e) =>
                                      updateAssertionField(
                                        a.localId,
                                        "pattern",
                                        e.target.value
                                      )
                                    }
                                  />
                                )}

                                {a.type === "header_equals" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Header name"
                                      value={a.header}
                                      onChange={(e) =>
                                        updateAssertionField(
                                          a.localId,
                                          "header",
                                          e.target.value
                                        )
                                      }
                                    />
                                    <Input
                                      placeholder="Expected value"
                                      value={a.value}
                                      onChange={(e) =>
                                        updateAssertionField(
                                          a.localId,
                                          "value",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </div>
                                )}

                                {a.type === "json_path_equals" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="JSON path, e.g. data.status"
                                      value={a.path}
                                      onChange={(e) =>
                                        updateAssertionField(
                                          a.localId,
                                          "path",
                                          e.target.value
                                        )
                                      }
                                    />
                                    <Input
                                      placeholder="Expected value"
                                      value={a.value}
                                      onChange={(e) =>
                                        updateAssertionField(
                                          a.localId,
                                          "value",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeAssertion(a.localId)}
                                className="shrink-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
