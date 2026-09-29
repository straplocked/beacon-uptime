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
import {
  AssertionsEditor,
  assertionsToDrafts,
  draftsToAssertions,
  type AssertionDraft,
} from "@/components/monitors/assertions-editor";
import type { Assertion } from "@/lib/monitoring/assertions";

/**
 * K1 805 — monitor edit form for the monitor detail page.
 *
 * Covers the settings that page previously only rendered read-only in the
 * "Configuration" rail: interval, timeout, HTTP method/expected status,
 * confirmation count, retry interval, and assertions. Reuses the same
 * `AssertionsEditor` and PATCH `/api/internal/monitors/[id]` endpoint (and
 * therefore the same server-side validation/clamping) as monitor creation.
 */

export interface MonitorEditFormInitial {
  intervalSeconds: number;
  timeoutMs: number;
  method: string | null;
  expectedStatusCode: number | null;
  confirmationCount: number;
  retryIntervalSeconds: number;
  assertions: Assertion[] | null;
}

interface MonitorEditFormProps {
  monitorId: string;
  monitorType: string;
  initial: MonitorEditFormInitial;
  onSaved: () => void;
  onCancel: () => void;
}

export function MonitorEditForm({
  monitorId,
  monitorType,
  initial,
  onSaved,
  onCancel,
}: MonitorEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assertions, setAssertions] = useState<AssertionDraft[]>(
    assertionsToDrafts(initial.assertions ?? []),
  );

  const isHttp = monitorType === "http";
  const isHeartbeat = monitorType === "heartbeat";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const body: Record<string, unknown> = {};

    const interval = parseInt(formData.get("interval") as string, 10);
    if (!Number.isNaN(interval)) body.intervalSeconds = interval;

    const timeout = parseInt(formData.get("timeout") as string, 10);
    if (!Number.isNaN(timeout)) body.timeoutMs = timeout;

    if (!isHeartbeat) {
      const confirmationCount = parseInt(
        formData.get("confirmationCount") as string,
        10,
      );
      if (!Number.isNaN(confirmationCount)) {
        body.confirmationCount = confirmationCount;
      }

      const retryInterval = parseInt(
        formData.get("retryInterval") as string,
        10,
      );
      if (!Number.isNaN(retryInterval)) {
        body.retryIntervalSeconds = retryInterval;
      }
    }

    if (isHttp) {
      body.method = formData.get("method") || "GET";
      const expectedStatus = parseInt(
        formData.get("expectedStatus") as string,
        10,
      );
      if (!Number.isNaN(expectedStatus)) {
        body.expectedStatusCode = expectedStatus;
      }
      body.assertions = draftsToAssertions(assertions);
    }

    try {
      const res = await fetch(`/api/internal/monitors/${monitorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update monitor");
        return;
      }

      router.refresh();
      onSaved();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive text-[12.5px] rounded-md p-2.5">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="interval" className="text-[11.5px]">
            Check interval (seconds)
          </Label>
          <Input
            id="interval"
            name="interval"
            type="number"
            defaultValue={initial.intervalSeconds}
            min="30"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timeout" className="text-[11.5px]">
            Timeout (ms)
          </Label>
          <Input
            id="timeout"
            name="timeout"
            type="number"
            defaultValue={initial.timeoutMs}
            min="1000"
            max="60000"
          />
        </div>
      </div>

      {isHttp && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11.5px]">HTTP method</Label>
            <Select name="method" defaultValue={initial.method ?? "GET"}>
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
          <div className="space-y-1.5">
            <Label htmlFor="expectedStatus" className="text-[11.5px]">
              Expected status code
            </Label>
            <Input
              id="expectedStatus"
              name="expectedStatus"
              type="number"
              defaultValue={initial.expectedStatusCode ?? 200}
            />
          </div>
        </div>
      )}

      {!isHeartbeat && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="confirmationCount" className="text-[11.5px]">
              Confirmations before alerting
            </Label>
            <Input
              id="confirmationCount"
              name="confirmationCount"
              type="number"
              defaultValue={initial.confirmationCount}
              min="1"
              max="10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retryInterval" className="text-[11.5px]">
              Retry interval (seconds)
            </Label>
            <Input
              id="retryInterval"
              name="retryInterval"
              type="number"
              defaultValue={initial.retryIntervalSeconds}
              min="15"
            />
          </div>
        </div>
      )}

      {isHttp && (
        <AssertionsEditor assertions={assertions} onChange={setAssertions} />
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
