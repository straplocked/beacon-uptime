import { WifiOff } from "lucide-react";

import { BeaconMark } from "@/components/brand/mark";

// Static offline fallback, precached by public/sw.js and served for any
// navigation that fails while the network is unreachable. Deliberately has
// no data dependency (no auth check, no fetch) — it must render from cache
// alone with the device fully offline.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
        <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-muted text-primary">
          <BeaconMark size={26} />
          <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" />
          </span>
        </div>
        <h1 className="text-lg font-semibold font-display tracking-[-0.01em]">
          You&apos;re offline
        </h1>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed">
          Beacon can&apos;t reach the network right now. Once you&apos;re back
          online, reload this page to pick up where you left off — your
          monitors keep checking in the background even while you&apos;re
          disconnected.
        </p>
      </div>
    </div>
  );
}
