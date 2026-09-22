"use client";

/**
 * PaletteExtractor — Sprint 6 / Differentiator #2.
 *
 * Sits at the top of the status-page Branding tab. The user pastes a site
 * URL (or a favicon / logo URL), we call the extract-palette endpoint, and
 * show the resulting swatches. Clicking a swatch applies it as the brand
 * color; an "Apply theme" chip applies the suggested status-page theme.
 *
 * It only *proposes* — nothing is applied until the user clicks, and the
 * existing manual brand-color picker and theme grid remain fully usable.
 */

import { Check, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { themeMeta, type StatusTheme } from "@/lib/status-themes";
import { cn } from "@/lib/utils";

interface Swatch {
  hex: string;
  role: "brand" | "accent" | "supporting";
  population: number;
}

interface ExtractResponse {
  sourceUrl: string;
  brandColor: string;
  rawBrandColor: string;
  brandAdjustedForContrast: boolean;
  brandContrast: number;
  suggestedTheme: StatusTheme;
  confidence: "high" | "medium" | "low";
  notes: string[];
  swatches: Swatch[];
}

interface PaletteExtractorProps {
  /** Prefill for the URL input (favicon field, custom domain, or slug). */
  defaultUrl?: string;
  /** The brand color currently applied, so we can show a ✓ on the active swatch. */
  currentBrandColor: string;
  onApplyBrandColor: (hex: string) => void;
  onApplyTheme: (theme: StatusTheme) => void;
}

const ROLE_LABEL: Record<Swatch["role"], string> = {
  brand: "Brand",
  accent: "Accent",
  supporting: "Supporting",
};

const CONFIDENCE_COLOR: Record<ExtractResponse["confidence"], string> = {
  high: "var(--status-up)",
  medium: "var(--status-degraded)",
  low: "var(--status-down)",
};

export function PaletteExtractor({
  defaultUrl = "",
  currentBrandColor,
  onApplyBrandColor,
  onApplyTheme,
}: PaletteExtractorProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResponse | null>(null);

  async function handleExtract() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a website or image URL first.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        "/api/internal/status-pages/extract-palette",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Extraction failed.");
        return;
      }
      setResult(data as ExtractResponse);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const normalizedCurrent = currentBrandColor.trim().toLowerCase();

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <Label className="text-[13px] font-semibold">
            Auto-brand from a website
          </Label>
          <p className="text-[11.5px] text-muted-foreground">
            Paste a site, page, or image URL — we pull the brand color from
            its favicon and suggest a matching theme.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleExtract();
            }
          }}
          placeholder="acme.com  ·  https://acme.com/logo.png"
          className="flex-1"
          aria-label="URL to extract a palette from"
        />
        <Button
          type="button"
          onClick={handleExtract}
          disabled={loading}
          size="sm"
        >
          {loading ? "Extracting…" : "Extract"}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-[12px] rounded-md p-2 border"
          style={{
            background: "oklch(from var(--destructive) l c h / 0.08)",
            borderColor: "oklch(from var(--destructive) l c h / 0.30)",
            color: "var(--destructive)",
          }}
        >
          <TriangleAlert className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-1">
          {/* Swatches */}
          <div className="flex flex-wrap gap-2">
            {result.swatches.map((s, i) => {
              const active = s.hex.toLowerCase() === normalizedCurrent;
              return (
                <button
                  key={`${s.hex}-${i}`}
                  type="button"
                  onClick={() => onApplyBrandColor(s.hex)}
                  title={`Apply ${s.hex} as brand color`}
                  className={cn(
                    "group relative flex flex-col items-center gap-1 rounded-md p-1.5 border transition-all",
                    active
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <span
                    className="h-9 w-9 rounded-md border border-black/5 flex items-center justify-center"
                    style={{ background: s.hex }}
                  >
                    {active && (
                      <Check
                        className="h-4 w-4"
                        style={{ color: "white", mixBlendMode: "difference" }}
                      />
                    )}
                  </span>
                  <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                    {ROLE_LABEL[s.role]}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {s.hex}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Suggested theme + metadata */}
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="text-muted-foreground">Suggested theme:</span>
            <button
              type="button"
              onClick={() => onApplyTheme(result.suggestedTheme)}
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-border bg-card hover:bg-muted transition-colors font-medium"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: themeMeta[result.suggestedTheme].preview.accent,
                }}
              />
              {themeMeta[result.suggestedTheme].name}
              <span className="text-muted-foreground">· apply</span>
            </button>

            <span
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md"
              style={{
                background: `oklch(from ${CONFIDENCE_COLOR[result.confidence]} l c h / 0.12)`,
                color: CONFIDENCE_COLOR[result.confidence],
              }}
              title="How confident we are in the detected brand color"
            >
              {result.confidence} confidence
            </span>

            {result.brandAdjustedForContrast && (
              <span className="text-muted-foreground">
                brand lightened for contrast ({result.brandContrast}:1)
              </span>
            )}
          </div>

          {result.notes.length > 0 && (
            <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
