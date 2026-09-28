"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "beacon-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "launched from home screen".
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPhoneIpad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ identifies as "MacIntel" but is touch-capable, unlike a real Mac.
  const isIPadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIPhoneIpad || isIPadOS;
}

/**
 * Small, dismissible "Install app" affordance for the dashboard shell.
 * - Chromium/Android/desktop: captures `beforeinstallprompt` and drives it.
 * - iOS Safari never fires that event, so it gets a one-line manual hint
 *   instead (there's no programmatic install prompt on iOS).
 * - Hidden once already running standalone, or after the user dismisses it
 *   (remembered in localStorage — this is a low-stakes UI preference, not
 *   state anything else needs to read).
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until effects settle
  const [standalone, setStandalone] = useState(false);
  const [iOS, setIOS] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private browsing / blocked storage — just don't remember dismissal.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(stored);
    setStandalone(isStandaloneDisplay());
    setIOS(isIOSDevice());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore — worst case the prompt reappears next session.
    }
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (standalone || dismissed) return null;
  if (!deferredPrompt && !iOS) return null;

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-card text-[12px]">
      <span className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary shrink-0">
        {iOS && !deferredPrompt ? (
          <Share className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </span>
      {deferredPrompt ? (
        <>
          <span className="flex-1 min-w-0 text-muted-foreground">
            Install Beacon for quick access
          </span>
          <button
            onClick={handleInstallClick}
            className="shrink-0 h-6 px-2 rounded border border-transparent bg-primary text-primary-foreground text-[11.5px] font-medium hover:opacity-95 transition-opacity"
          >
            Install
          </button>
        </>
      ) : (
        <span className="flex-1 min-w-0 text-muted-foreground leading-snug">
          Tap Share, then &quot;Add to Home Screen&quot; to install
        </span>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 flex items-center justify-center w-8 h-8 -mr-1.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
