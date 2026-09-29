import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDbSelect = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  pushSubscriptions: { organizationId: "pushSubscriptions.organizationId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ op: "eq", val })),
}));

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue", () => ({
  notificationQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

import {
  buildMonitorPushPayload,
  enqueuePushNotifications,
} from "./push-fanout";

function chainableSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe("buildMonitorPushPayload", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("links to the incident when one is affected", () => {
    process.env.BASE_URL = "https://beacon.example.com";
    const payload = buildMonitorPushPayload({
      organizationId: "org-1",
      monitorId: "mon-1",
      monitorName: "API",
      status: "down",
      incidentId: "inc-1",
    });
    expect(payload.url).toBe("https://beacon.example.com/incidents/inc-1");
    expect(payload.title).toContain("API is down");
  });

  it("falls back to the monitor page when there is no incident", () => {
    process.env.BASE_URL = "https://beacon.example.com";
    const payload = buildMonitorPushPayload({
      organizationId: "org-1",
      monitorId: "mon-1",
      monitorName: "API",
      status: "up",
      incidentId: null,
    });
    expect(payload.url).toBe("https://beacon.example.com/monitors/mon-1");
    expect(payload.title).toContain("back up");
  });
});

describe("enqueuePushNotifications", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does nothing when VAPID env vars are not set (feature hidden)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    await enqueuePushNotifications({
      organizationId: "org-1",
      monitorId: "mon-1",
      monitorName: "API",
      status: "down",
      incidentId: null,
    });

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("enqueues one job per subscription in the organization", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    mockDbSelect.mockReturnValue(
      chainableSelect([
        { id: "sub-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
        { id: "sub-2", endpoint: "e2", p256dh: "p2", auth: "a2" },
      ]),
    );

    await enqueuePushNotifications({
      organizationId: "org-1",
      monitorId: "mon-1",
      monitorName: "API",
      status: "down",
      incidentId: "inc-1",
    });

    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    const [jobName, jobData, opts] = mockQueueAdd.mock.calls[0];
    expect(jobName).toBe("push-sub-1");
    expect(jobData.type).toBe("push-notification");
    expect(jobData.endpoint).toBe("e1");
    expect(jobData.payload.url).toContain("/incidents/inc-1");
    expect(opts).toEqual({ priority: 1 });
  });

  it("does nothing when there are no subscriptions", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    mockDbSelect.mockReturnValue(chainableSelect([]));

    await enqueuePushNotifications({
      organizationId: "org-1",
      monitorId: "mon-1",
      monitorName: "API",
      status: "up",
      incidentId: null,
    });

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
