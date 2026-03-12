"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ApiKeySectionProps {
  hasApiKey: boolean;
  canUseApi: boolean;
}

export function ApiKeySection({ hasApiKey, canUseApi }: ApiKeySectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyExists, setKeyExists] = useState(hasApiKey);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError("");
    setLoading(true);
    setNewKey(null);

    try {
      const res = await fetch("/api/internal/settings/api-key", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate API key");
        return;
      }

      setNewKey(data.apiKey);
      setKeyExists(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke your API key? Any integrations using it will stop working.")) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/internal/settings/api-key", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to revoke API key");
        return;
      }

      setKeyExists(false);
      setNewKey(null);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
            {error}
          </div>
        )}

        {!canUseApi ? (
          <p className="text-sm text-muted-foreground">
            API access requires a Pro or Team plan.
          </p>
        ) : newKey ? (
          <div className="space-y-3">
            <div className="bg-muted p-3 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="flex gap-2">
                <Input
                  value={newKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={loading}>
              Revoke Key
            </Button>
          </div>
        ) : keyExists ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value="bk_••••••••••••••••"
                readOnly
                disabled
                className="font-mono text-sm w-56"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={loading} size="sm">
                {loading ? "Generating..." : "Regenerate"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevoke}
                disabled={loading}
              >
                Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate an API key to access the Beacon API programmatically.
            </p>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate API Key"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
