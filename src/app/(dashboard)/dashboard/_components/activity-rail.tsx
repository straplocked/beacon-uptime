/**
 * Recent activity rail for the dashboard right column.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-DASH).
 */

export type ActivityKind = "system-up" | "system-down" | "comment" | "system";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  who: string;
  what: string;
  ago: string;
  /** Optional @mention to highlight in the body, e.g. "@dane". */
  mention?: string;
}

const DOT_COLOR: Record<ActivityKind, string> = {
  "system-up": "var(--status-up)",
  "system-down": "var(--status-down)",
  comment: "var(--primary)",
  system: "var(--muted-foreground)",
};

export function ActivityRail({
  activity,
}: {
  activity: ActivityEntry[];
}) {
  return (
    <section
      className="bg-card border border-border rounded-lg p-3.5"
      aria-label="Activity"
    >
      <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[0.01em]">
        Activity
        <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">
          last 24h
        </span>
      </h3>
      {activity.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          Nothing has happened yet today.
        </p>
      ) : (
        activity.map((a, idx) => (
          <div
            key={a.id}
            className="flex items-start gap-2.5 py-1.5 text-[12px]"
            style={{
              borderBottom:
                idx === activity.length - 1
                  ? "none"
                  : "1px solid var(--border)",
            }}
          >
            <span
              aria-hidden
              className="mt-1.5 rounded-full shrink-0"
              style={{
                width: 6,
                height: 6,
                background: DOT_COLOR[a.kind],
              }}
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-foreground">{a.who}</span>{" "}
              <span className="text-muted-foreground">
                {a.what}
                {a.mention && (
                  <span
                    className="ml-1 font-medium"
                    style={{ color: "var(--primary)" }}
                  >
                    {a.mention}
                  </span>
                )}
              </span>
            </div>
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {a.ago}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
