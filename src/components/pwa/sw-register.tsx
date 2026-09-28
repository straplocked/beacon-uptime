"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js. Production only — `next dev`'s HMR and the SW's
 * cache-first strategy for /_next/static/* fight each other (stale chunks
 * survive a dev rebuild), so this is a deliberate no-op under `next dev`.
 *
 * Mount once, near the root layout, so it applies to every route including
 * (auth) and (dashboard). It renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failures (unsupported browser, blocked by an
      // extension, etc.) shouldn't be user-facing — the app works fine
      // without the SW, just without offline/install support.
    });
  }, []);

  return null;
}
