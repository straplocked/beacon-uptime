"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface IncidentUpdateFormProps {
  incidentId: string;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

/**
 * Composer for incident updates.
 *
 * Sprint 5 / Diff #1:
 *   - Toggle between **Status update** (publishes to subscribers + status page)
 *     and **Internal comment** (org-only — visible in dashboard, not subscribers).
 *   - Comment mode hides the status select since comments don't roll up
 *     the incident's state.
 *   - Server-side: wraps `POST /api/internal/incidents/:id/updates` which
 *     persists `kind` and `mentions` from Sprint 5's schema additions.
 *
 * @-mention autocomplete is a follow-up — for v1, mentions are inferred
 * server-side from `@token` substrings (not yet implemented; fields in
 * place for the next iteration).
 */
export function IncidentUpdateForm({
  incidentId,
  currentStatus,
}: IncidentUpdateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [kind, setKind] = useState<"status" | "comment">("status");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const message = (formData.get("message") as string).trim();
    if (!message) {
      setError("Message is required");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/internal/incidents/${incidentId}/updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            message,
            kind,
            mentions: [],
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add update");
        return;
      }
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="text-[12px] rounded-md p-2 border"
          style={{
            background: "oklch(from var(--destructive) l c h / 0.08)",
            borderColor: "oklch(from var(--destructive) l c h / 0.30)",
            color: "var(--destructive)",
          }}
        >
          {error}
        </div>
      )}

      {/* Kind toggle */}
      <div
        className="inline-flex p-0.5 rounded-md border border-border bg-card text-[11.5px] w-fit"
        role="radiogroup"
        aria-label="Update kind"
      >
        <KindButton
          active={kind === "status"}
          onClick={() => setKind("status")}
        >
          Status update
        </KindButton>
        <KindButton
          active={kind === "comment"}
          onClick={() => setKind("comment")}
        >
          Internal comment
        </KindButton>
      </div>

      {kind === "status" && (
        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-[11.5px]">
            New status
          </Label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="message" className="text-[11.5px]">
          {kind === "comment" ? "Comment" : "Message"}
        </Label>
        <Textarea
          id="message"
          name="message"
          placeholder={
            kind === "comment"
              ? "Visible to your team only…  (use @name to ping a teammate)"
              : "Provide an update to publish on the status page…"
          }
          rows={3}
          required
          className="text-[12.5px]"
        />
        <p className="text-[10.5px] text-muted-foreground">
          {kind === "comment"
            ? "Internal — never sent to status-page subscribers."
            : "Published to the status page + email subscribers."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading
            ? "Posting…"
            : kind === "comment"
              ? "Post comment"
              : "Post status update"}
        </Button>
      </div>
    </form>
  );
}

function KindButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "h-6 px-2.5 rounded-[5px] transition-colors",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
