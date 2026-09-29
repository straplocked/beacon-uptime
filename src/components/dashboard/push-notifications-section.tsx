"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * K1 802 — Settings toggle for browser push notifications from the
 * installed PWA. Fully self-hiding: if the server has no VAPID keys
 * configured (`GET /api/internal/notifications/push/config` returns
 * `enabled: false`), or the browser doesn't support Push/ServiceWorker at
 * all, this renders nothing rather than a broken control.
 */

type LoadState = "loading" | "unavailable" | "ready";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushNotificationsSection() {
  const [state, setState] = useState<LoadState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!browserSupportsPush()) {
        if (!cancelled) setState("unavailable");
        return;
      }

      try {
        const res = await fetch("/api/internal/notifications/push/config");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.enabled || !data.publicKey) {
          setState("unavailable");
          return;
        }

        setPublicKey(data.publicKey);

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSubscribed(!!existing);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(next: boolean) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;

      if (next) {
        if (!publicKey) throw new Error("Push is not configured");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Notification permission was not granted");
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // TS's DOM lib wants a `BufferSource` typed against a concrete
          // ArrayBuffer; our Uint8Array is backed by one, so this is safe.
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        const json = subscription.toJSON();
        const res = await fetch("/api/internal/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
          }),
        });
        if (!res.ok) {
          await subscription.unsubscribe();
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save subscription");
        }
        setSubscribed(true);
      } else {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch("/api/internal/notifications/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
        setSubscribed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTest() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/internal/notifications/push/test", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send test notification");
        return;
      }
      setMessage(
        data.sent > 0
          ? `Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`
          : "No active devices to send to.",
      );
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unavailable") {
    return null;
  }

  return (
    <div className="flex flex-col gap-2.5 pt-2 mt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2">
          <Bell className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-[12.5px] font-medium text-foreground m-0">
              Browser push
            </p>
            <p className="text-[11.5px] text-muted-foreground m-0">
              Get a notification on this device when a monitor changes state.
            </p>
          </div>
        </div>
        <Switch
          checked={subscribed}
          onCheckedChange={handleToggle}
          disabled={busy}
        />
      </div>

      {subscribed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSendTest}
          disabled={busy}
          className="self-start"
        >
          Send test notification
        </Button>
      )}

      {message && (
        <p className="text-[11.5px]" style={{ color: "var(--status-up)" }}>
          {message}
        </p>
      )}
      {error && (
        <p className="text-[11.5px]" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
