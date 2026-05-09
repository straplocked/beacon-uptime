"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface AcknowledgeButtonProps {
  incidentId: string;
}

/**
 * Sprint 5 / Diff #1 — single-click acknowledge.
 *
 * POSTs to /api/internal/incidents/[id]/acknowledge. The server claims
 * the incident, sets `acknowledgedAt` and `acknowledgedByUserId`, and
 * emits a `system` timeline entry. Idempotent — a 409 from a race is
 * silently swallowed (the page refresh shows the winning ack).
 */
export function AcknowledgeButton({ incidentId }: AcknowledgeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/internal/incidents/${incidentId}/acknowledge`,
        { method: "POST" },
      );
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={handleClick}
        disabled={loading}
        title="Claim ownership of this incident"
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
        {loading ? "Acknowledging…" : "Acknowledge"}
      </Button>
      {error && (
        <span className="text-[11px]" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
