"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MonitorOption {
  id: string;
  name: string;
  target: string;
  status: string;
}

interface MonitorLink {
  monitorId: string;
  displayName: string;
  sortOrder: number;
  groupName: string;
}

interface StatusPageData {
  id?: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandColor: string;
  customCss: string | null;
  headerText: string | null;
  footerText: string | null;
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  showHistoryDays: number;
  isPublic: boolean;
}

interface LinkedMonitor {
  monitorId: string;
  displayName: string | null;
  sortOrder: number;
  groupName: string | null;
}

interface StatusPageFormProps {
  mode: "create" | "edit";
  initialData?: StatusPageData;
  initialMonitors?: LinkedMonitor[];
  plan?: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function StatusPageForm({
  mode,
  initialData,
  initialMonitors,
  plan = "free",
}: StatusPageFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [availableMonitors, setAvailableMonitors] = useState<MonitorOption[]>(
    []
  );

  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [headerText, setHeaderText] = useState(
    initialData?.headerText || ""
  );
  const [footerText, setFooterText] = useState(
    initialData?.footerText || ""
  );
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
  const [brandColor, setBrandColor] = useState(
    initialData?.brandColor || "#14b8a6"
  );
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl || "");
  const [faviconUrl, setFaviconUrl] = useState(
    initialData?.faviconUrl || ""
  );
  const [customDomain, setCustomDomain] = useState(
    initialData?.customDomain || ""
  );
  const [customCss, setCustomCss] = useState(initialData?.customCss || "");
  const [showUptimePercentage, setShowUptimePercentage] = useState(
    initialData?.showUptimePercentage ?? true
  );
  const [showResponseTime, setShowResponseTime] = useState(
    initialData?.showResponseTime ?? true
  );
  const [showHistoryDays, setShowHistoryDays] = useState(
    initialData?.showHistoryDays ?? 90
  );

  // Monitor selection
  const [selectedMonitors, setSelectedMonitors] = useState<MonitorLink[]>(
    () =>
      initialMonitors?.map((m) => ({
        monitorId: m.monitorId,
        displayName: m.displayName || "",
        sortOrder: m.sortOrder,
        groupName: m.groupName || "",
      })) || []
  );

  const canCustomDomain = plan === "pro" || plan === "team";
  const canCustomCss = plan === "pro" || plan === "team";

  useEffect(() => {
    fetch("/api/internal/monitors")
      .then((res) => res.json())
      .then((data) => setAvailableMonitors(data.monitors || []))
      .catch(() => {});
  }, []);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(toSlug(value));
    }
  }

  function toggleMonitor(monitorId: string) {
    setSelectedMonitors((prev) => {
      const exists = prev.find((m) => m.monitorId === monitorId);
      if (exists) {
        return prev.filter((m) => m.monitorId !== monitorId);
      }
      return [
        ...prev,
        {
          monitorId,
          displayName: "",
          sortOrder: prev.length,
          groupName: "",
        },
      ];
    });
  }

  function updateMonitorLink(
    monitorId: string,
    field: keyof MonitorLink,
    value: string | number
  ) {
    setSelectedMonitors((prev) =>
      prev.map((m) =>
        m.monitorId === monitorId ? { ...m, [field]: value } : m
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      name,
      slug,
      customDomain: canCustomDomain && customDomain ? customDomain : null,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      brandColor,
      customCss: canCustomCss && customCss ? customCss : null,
      headerText: headerText || null,
      footerText: footerText || null,
      showUptimePercentage,
      showResponseTime,
      showHistoryDays,
      isPublic,
      monitors: selectedMonitors.map((m) => ({
        monitorId: m.monitorId,
        displayName: m.displayName || undefined,
        sortOrder: m.sortOrder,
        groupName: m.groupName || undefined,
      })),
    };

    const url =
      mode === "create"
        ? "/api/internal/status-pages"
        : `/api/internal/status-pages/${initialData?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push("/status-pages");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this status page?")) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/internal/status-pages/${initialData?.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        router.push("/status-pages");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="monitors">
            Monitors ({selectedMonitors.length})
          </TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Page Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Status Page"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/s/</span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    placeholder="my-status-page"
                    pattern="^[a-z0-9-]+$"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headerText">Header Text</Label>
                <Input
                  id="headerText"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="All systems operational"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Input
                  id="footerText"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Powered by Beacon"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Public</Label>
                  <p className="text-sm text-muted-foreground">
                    Make this page visible to everyone
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitors">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {availableMonitors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No monitors found. Create monitors first.
                </p>
              ) : (
                availableMonitors.map((monitor) => {
                  const selected = selectedMonitors.find(
                    (m) => m.monitorId === monitor.id
                  );
                  return (
                    <div key={monitor.id} className="border rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleMonitor(monitor.id)}
                          className="h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{monitor.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {monitor.target}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <div className="mt-3 grid grid-cols-3 gap-3 pl-7">
                          <div className="space-y-1">
                            <Label className="text-xs">Display Name</Label>
                            <Input
                              value={selected.displayName}
                              onChange={(e) =>
                                updateMonitorLink(
                                  monitor.id,
                                  "displayName",
                                  e.target.value
                                )
                              }
                              placeholder={monitor.name}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Group</Label>
                            <Input
                              value={selected.groupName}
                              onChange={(e) =>
                                updateMonitorLink(
                                  monitor.id,
                                  "groupName",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. API, Website"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Sort Order</Label>
                            <Input
                              type="number"
                              value={selected.sortOrder}
                              onChange={(e) =>
                                updateMonitorLink(
                                  monitor.id,
                                  "sortOrder",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="h-8 text-sm"
                              min={0}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandColor">Brand Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="brandColor"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 rounded border cursor-pointer"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#14b8a6"
                    className="w-32"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="faviconUrl">Favicon URL</Label>
                <Input
                  id="faviconUrl"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="customDomain">Custom Domain</Label>
                  {!canCustomDomain && (
                    <span className="text-xs text-muted-foreground">
                      Pro plan required
                    </span>
                  )}
                </div>
                <Input
                  id="customDomain"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="status.yoursite.com"
                  disabled={!canCustomDomain}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="customCss">Custom CSS</Label>
                  {!canCustomCss && (
                    <span className="text-xs text-muted-foreground">
                      Pro plan required
                    </span>
                  )}
                </div>
                <Textarea
                  id="customCss"
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder=".status-page { /* your styles */ }"
                  rows={6}
                  disabled={!canCustomCss}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="display">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Show Uptime Percentage</Label>
                  <p className="text-sm text-muted-foreground">
                    Display uptime % next to each monitor
                  </p>
                </div>
                <Switch
                  checked={showUptimePercentage}
                  onCheckedChange={setShowUptimePercentage}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show Response Time</Label>
                  <p className="text-sm text-muted-foreground">
                    Display avg response time for each monitor
                  </p>
                </div>
                <Switch
                  checked={showResponseTime}
                  onCheckedChange={setShowResponseTime}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="historyDays">History Days</Label>
                <p className="text-sm text-muted-foreground">
                  Number of days shown in the uptime bar
                </p>
                <Input
                  id="historyDays"
                  type="number"
                  value={showHistoryDays}
                  onChange={(e) =>
                    setShowHistoryDays(parseInt(e.target.value) || 90)
                  }
                  min={7}
                  max={365}
                  className="w-24"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex gap-3 pt-6">
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Status Page"
              : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/status-pages")}
        >
          Cancel
        </Button>
        {mode === "edit" && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="ml-auto"
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
