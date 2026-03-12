"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2 } from "lucide-react";

export function MonitorActions({
  monitorId,
  isPaused,
}: {
  monitorId: string;
  isPaused: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function togglePause() {
    setLoading(true);
    await fetch(`/api/internal/monitors/${monitorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaused: !isPaused }),
    });
    router.refresh();
    setLoading(false);
  }

  async function deleteMonitor() {
    if (!confirm("Are you sure you want to delete this monitor?")) return;
    setLoading(true);
    await fetch(`/api/internal/monitors/${monitorId}`, {
      method: "DELETE",
    });
    router.push("/monitors");
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={togglePause}
        disabled={loading}
      >
        {isPaused ? (
          <>
            <Play className="h-4 w-4 mr-1" /> Resume
          </>
        ) : (
          <>
            <Pause className="h-4 w-4 mr-1" /> Pause
          </>
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={deleteMonitor}
        disabled={loading}
        className="text-red-600 hover:text-red-700"
      >
        <Trash2 className="h-4 w-4 mr-1" /> Delete
      </Button>
    </div>
  );
}
