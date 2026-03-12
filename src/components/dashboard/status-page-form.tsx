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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_THEMES, themeMeta, type StatusTheme } from "@/lib/status-themes";
import type { FooterConfig, FooterItem, FooterSection } from "@/lib/types/footer";
import { Plus, Trash2, Type, Copyright, ExternalLink } from "lucide-react";

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
  displayStyle: string;
}

interface StatusPageData {
  id?: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  brandColor: string;
  customCss: string | null;
  headerText: string | null;
  footerText: string | null;
  footerConfig?: FooterConfig | null;
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
  displayStyle?: string;
}

interface StatusPageFormProps {
  mode: "create" | "edit";
  initialData?: StatusPageData;
  initialMonitors?: LinkedMonitor[];
  plan?: string;
}

type SectionKey = "left" | "center" | "right";

const EMPTY_FOOTER_CONFIG: FooterConfig = {
  sections: {},
  showPoweredBy: true,
  showRss: true,
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function itemPreview(item: FooterItem): string {
  switch (item.type) {
    case "text":
      return item.content;
    case "copyright":
      return `\u00a9 ${item.companyName}`;
    case "link":
      return item.label;
  }
}

function itemIcon(type: FooterItem["type"]) {
  switch (type) {
    case "text":
      return <Type className="h-3 w-3" />;
    case "copyright":
      return <Copyright className="h-3 w-3" />;
    case "link":
      return <ExternalLink className="h-3 w-3" />;
  }
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
  const resolvedTheme = (initialData?.theme && STATUS_THEMES.includes(initialData.theme as StatusTheme))
    ? initialData.theme as StatusTheme
    : "midnight";
  const [theme, setTheme] = useState<StatusTheme>(resolvedTheme);
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

  // Footer config state
  const [footerConfig, setFooterConfig] = useState<FooterConfig>(
    initialData?.footerConfig || EMPTY_FOOTER_CONFIG
  );
  const [useFooterConfig, setUseFooterConfig] = useState(
    !!initialData?.footerConfig
  );

  // Adding items state
  const [addingTo, setAddingTo] = useState<SectionKey | null>(null);
  const [addItemType, setAddItemType] = useState<FooterItem["type"]>("text");
  const [addTextContent, setAddTextContent] = useState("");
  const [addCompanyName, setAddCompanyName] = useState("");
  const [addLinkLabel, setAddLinkLabel] = useState("");
  const [addLinkUrl, setAddLinkUrl] = useState("");

  // Monitor selection
  const [selectedMonitors, setSelectedMonitors] = useState<MonitorLink[]>(
    () =>
      initialMonitors?.map((m) => ({
        monitorId: m.monitorId,
        displayName: m.displayName || "",
        sortOrder: m.sortOrder,
        groupName: m.groupName || "",
        displayStyle: m.displayStyle || "bars",
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
          displayStyle: "bars",
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

  // Footer helpers
  function getSectionItems(key: SectionKey): FooterItem[] {
    return footerConfig.sections[key]?.items || [];
  }

  function updateSection(key: SectionKey, items: FooterItem[]) {
    setFooterConfig((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [key]: items.length > 0 ? { items } : undefined,
      },
    }));
  }

  function removeItem(key: SectionKey, index: number) {
    const items = getSectionItems(key).filter((_, i) => i !== index);
    updateSection(key, items);
  }

  function addItem(key: SectionKey) {
    let newItem: FooterItem;
    switch (addItemType) {
      case "text":
        if (!addTextContent.trim()) return;
        newItem = { type: "text", content: addTextContent.trim() };
        break;
      case "copyright":
        if (!addCompanyName.trim()) return;
        newItem = { type: "copyright", companyName: addCompanyName.trim() };
        break;
      case "link":
        if (!addLinkLabel.trim() || !addLinkUrl.trim()) return;
        newItem = { type: "link", label: addLinkLabel.trim(), url: addLinkUrl.trim() };
        break;
    }

    const items = [...getSectionItems(key), newItem];
    updateSection(key, items);

    // Reset
    setAddingTo(null);
    setAddTextContent("");
    setAddCompanyName("");
    setAddLinkLabel("");
    setAddLinkUrl("");
    setAddItemType("text");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      name,
      slug,
      theme,
      customDomain: canCustomDomain && customDomain ? customDomain : null,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      brandColor,
      customCss: canCustomCss && customCss ? customCss : null,
      headerText: headerText || null,
      footerText: footerText || null,
      footerConfig: useFooterConfig ? footerConfig : null,
      showUptimePercentage,
      showResponseTime,
      showHistoryDays,
      isPublic,
      monitors: selectedMonitors.map((m) => ({
        monitorId: m.monitorId,
        displayName: m.displayName || undefined,
        sortOrder: m.sortOrder,
        groupName: m.groupName || undefined,
        displayStyle: m.displayStyle,
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

  function renderFooterSection(key: SectionKey, label: string) {
    const items = getSectionItems(key);

    return (
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>

        {items.length > 0 && (
          <div className="space-y-1">
            {items.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {itemIcon(item.type)}
                </span>
                <span className="flex-1 truncate">{itemPreview(item)}</span>
                <button
                  type="button"
                  onClick={() => removeItem(key, i)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingTo === key ? (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex gap-2">
              <Select
                value={addItemType}
                onValueChange={(v) => {
                  if (v) setAddItemType(v as FooterItem["type"]);
                }}
              >
                <SelectTrigger className="w-[130px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="copyright">Copyright</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {addItemType === "text" && (
              <Input
                value={addTextContent}
                onChange={(e) => setAddTextContent(e.target.value)}
                placeholder="Footer text..."
                className="h-8 text-sm"
              />
            )}

            {addItemType === "copyright" && (
              <Input
                value={addCompanyName}
                onChange={(e) => setAddCompanyName(e.target.value)}
                placeholder="Company name"
                className="h-8 text-sm"
              />
            )}

            {addItemType === "link" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={addLinkLabel}
                  onChange={(e) => setAddLinkLabel(e.target.value)}
                  placeholder="Label"
                  className="h-8 text-sm"
                />
                <Input
                  value={addLinkUrl}
                  onChange={(e) => setAddLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-8 text-sm"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addItem(key)}
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAddingTo(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          items.length < 10 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setAddingTo(key);
                setAddItemType("text");
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Item
            </Button>
          )
        )}
      </div>
    );
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
          <TabsTrigger value="footer">Footer</TabsTrigger>
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
                        <div className="mt-3 grid grid-cols-4 gap-3 pl-7">
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
                          <div className="space-y-1">
                            <Label className="text-xs">Display Style</Label>
                            <Select
                              value={selected.displayStyle}
                              onValueChange={(v) => {
                                if (v)
                                  updateMonitorLink(
                                    monitor.id,
                                    "displayStyle",
                                    v
                                  );
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bars">
                                  Uptime Bars
                                </SelectItem>
                                <SelectItem value="chart">
                                  Response Chart
                                </SelectItem>
                                <SelectItem value="compact">
                                  Compact
                                </SelectItem>
                              </SelectContent>
                            </Select>
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
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Choose the visual style for your status page
                </p>
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {STATUS_THEMES.map((t) => {
                    const meta = themeMeta[t];
                    const selected = theme === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={`relative rounded-lg border-2 p-2 transition-all text-left ${
                          selected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        {/* Mini preview */}
                        <div
                          className="rounded-md h-14 mb-2 flex flex-col justify-end p-1.5 gap-0.5"
                          style={{ background: meta.preview.bg }}
                        >
                          <div
                            className="h-1 rounded-full w-full"
                            style={{ background: meta.preview.accent, opacity: 0.8 }}
                          />
                          <div className="flex gap-[1px]">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div
                                key={i}
                                className="flex-1 h-1.5 rounded-[1px]"
                                style={{
                                  background: meta.preview.accent,
                                  opacity: 0.3 + Math.random() * 0.5,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs font-medium truncate">{meta.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {meta.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

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

        <TabsContent value="footer">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Structured Footer</Label>
                  <p className="text-sm text-muted-foreground">
                    Use a structured footer with sections instead of plain text
                  </p>
                </div>
                <Switch
                  checked={useFooterConfig}
                  onCheckedChange={setUseFooterConfig}
                />
              </div>

              {useFooterConfig ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Show Powered by Beacon</Label>
                    </div>
                    <Switch
                      checked={footerConfig.showPoweredBy}
                      onCheckedChange={(v) =>
                        setFooterConfig((prev) => ({
                          ...prev,
                          showPoweredBy: v,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Show RSS Link</Label>
                    </div>
                    <Switch
                      checked={footerConfig.showRss}
                      onCheckedChange={(v) =>
                        setFooterConfig((prev) => ({
                          ...prev,
                          showRss: v,
                        }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {renderFooterSection("left", "Left")}
                    {renderFooterSection("center", "Center")}
                    {renderFooterSection("right", "Right")}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="footerTextLegacy">Footer Text</Label>
                  <Input
                    id="footerTextLegacy"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Powered by Beacon"
                  />
                </div>
              )}
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
