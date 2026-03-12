import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the module
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  monitors: { id: "monitors.id" },
  checkResults: {},
  incidents: {
    statusPageId: "incidents.statusPageId",
    resolvedAt: "incidents.resolvedAt",
    status: "incidents.status",
    id: "incidents.id",
  },
  incidentUpdates: {},
  statusPageMonitors: {
    monitorId: "statusPageMonitors.monitorId",
    statusPageId: "statusPageMonitors.statusPageId",
  },
  statusPages: {
    id: "statusPages.id",
    slug: "statusPages.slug",
    name: "statusPages.name",
  },
  subscribers: {
    statusPageId: "subscribers.statusPageId",
    confirmed: "subscribers.confirmed",
    unsubscribedAt: "subscribers.unsubscribedAt",
  },
  users: { id: "users.id", plan: "users.plan" },
  notificationChannels: { userId: "notificationChannels.userId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ op: "eq", val })),
  and: vi.fn((...args) => ({ op: "and", args })),
  isNull: vi.fn((col) => ({ op: "isNull", col })),
  ne: vi.fn((_col, val) => ({ op: "ne", val })),
}));

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue", () => ({
  notificationQueue: {
    add: (...args: any[]) => mockQueueAdd(...args),
  },
}));

vi.mock("@/lib/plans", () => ({
  PLAN_LIMITS: {
    free: { subscriberNotifications: false },
    pro: { subscriberNotifications: true },
    team: { subscriberNotifications: true },
  },
}));

import { processCheckResult } from "./evaluator";

const baseMonitor = {
  id: "mon-1",
  userId: "user-1",
  name: "Test Monitor",
  target: "https://example.com",
  type: "http",
};

const upResult = {
  monitorId: "mon-1",
  region: "us-east",
  status: "up" as const,
  responseTimeMs: 150,
  statusCode: 200,
  errorMessage: null,
  tlsExpiry: null,
};

const downResult = {
  ...upResult,
  status: "down" as const,
  statusCode: 500,
  errorMessage: "Internal Server Error",
};

// Helper to build a deep chainable mock
function chainable(resolvedValue: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolvedValue);
  // For queries that don't use .limit() — return the resolved value directly from .where()
  chain.where.mockImplementation(() => {
    const subChain: any = {
      limit: vi.fn().mockResolvedValue(resolvedValue),
    };
    // Also handle direct await on where (for queries without .limit)
    subChain.then = (resolve: any) => Promise.resolve(resolvedValue).then(resolve);
    return subChain;
  });
  return chain;
}

function setupDefaultMocks() {
  // insert: checkResults insert (no returning), incident insert (with returning)
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        { id: "incident-1", title: "Test is down" },
      ]),
      then: (resolve: any) => Promise.resolve().then(resolve),
    }),
  });

  // update: monitor status update
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  // select: default to empty results
  mockDbSelect.mockReturnValue(chainable([]));
}

describe("processCheckResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("inserts check result into database", async () => {
    await processCheckResult({ ...baseMonitor, status: "pending" }, upResult);
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("updates monitor status", async () => {
    await processCheckResult({ ...baseMonitor, status: "pending" }, upResult);
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("does not trigger notifications when transitioning from pending", async () => {
    await processCheckResult({ ...baseMonitor, status: "pending" }, upResult);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("does not trigger notifications when transitioning from paused", async () => {
    await processCheckResult({ ...baseMonitor, status: "paused" }, upResult);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("does not trigger notifications when status unchanged", async () => {
    await processCheckResult({ ...baseMonitor, status: "up" }, upResult);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("enqueues notifications on up -> down transition", async () => {
    // Select calls in order:
    // 1. statusPageMonitors (linked pages for auto-incident) -> empty
    // 2. notificationChannels (user's channels) -> one email channel
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]); // no linked pages
      return chainable([
        { id: "ch-1", type: "email", config: { email: "test@example.com" } },
      ]);
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [jobName, jobData, opts] = mockQueueAdd.mock.calls[0];
    expect(jobName).toContain("notify-email");
    expect(jobData.payload.event).toBe("monitor.down");
    expect(opts).toEqual({ priority: 1 });
  });

  it("sets priority 3 for non-down events", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]); // no linked pages
      return chainable([
        { id: "ch-1", type: "slack", config: { webhookUrl: "https://hooks.slack.com" } },
      ]);
    });

    await processCheckResult(
      { ...baseMonitor, status: "down" },
      upResult
    );

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [, jobData, opts] = mockQueueAdd.mock.calls[0];
    expect(jobData.payload.event).toBe("monitor.up");
    expect(opts).toEqual({ priority: 3 });
  });

  it("enqueues to multiple channels", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]); // no linked pages
      return chainable([
        { id: "ch-1", type: "email", config: {} },
        { id: "ch-2", type: "slack", config: {} },
        { id: "ch-3", type: "discord", config: {} },
      ]);
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    expect(mockQueueAdd).toHaveBeenCalledTimes(3);
  });

  it("does not enqueue when no notification channels exist", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      return chainable([]); // no linked pages AND no channels
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

describe("status change detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  const cases = [
    { from: "pending", to: "up", shouldTrigger: false },
    { from: "pending", to: "down", shouldTrigger: false },
    { from: "paused", to: "up", shouldTrigger: false },
    { from: "paused", to: "down", shouldTrigger: false },
    { from: "up", to: "up", shouldTrigger: false },
    { from: "down", to: "down", shouldTrigger: false },
    { from: "degraded", to: "degraded", shouldTrigger: false },
    { from: "up", to: "down", shouldTrigger: true },
    { from: "up", to: "degraded", shouldTrigger: true },
    { from: "down", to: "up", shouldTrigger: true },
    { from: "degraded", to: "up", shouldTrigger: true },
    { from: "degraded", to: "down", shouldTrigger: true },
    { from: "down", to: "degraded", shouldTrigger: true },
  ] as const;

  for (const { from, to, shouldTrigger } of cases) {
    it(`${from} -> ${to}: ${shouldTrigger ? "triggers" : "skips"} status change logic`, async () => {
      // Provide empty results for all selects so the flow completes without errors
      mockDbSelect.mockReturnValue(chainable([]));

      await processCheckResult(
        { ...baseMonitor, status: from },
        { ...upResult, status: to as "up" | "down" | "degraded" }
      );

      if (!shouldTrigger) {
        // Only insert (check result) and update (monitor status) should be called
        // No select calls for linked pages or notification channels
        expect(mockDbSelect).not.toHaveBeenCalled();
      } else {
        // Should have at least one select (linked pages or notification channels)
        expect(mockDbSelect).toHaveBeenCalled();
      }
    });
  }
});

describe("notification payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("includes monitor details in payload", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    const payload = mockQueueAdd.mock.calls[0][1].payload;
    expect(payload.monitor).toEqual({
      id: "mon-1",
      name: "Test Monitor",
      target: "https://example.com",
      type: "http",
    });
  });

  it("includes check details in payload", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    const payload = mockQueueAdd.mock.calls[0][1].payload;
    expect(payload.check.status).toBe("down");
    expect(payload.check.statusCode).toBe(500);
    expect(payload.check.error).toBe("Internal Server Error");
    expect(payload.check.region).toBe("us-east");
    expect(payload.previousStatus).toBe("up");
  });

  it("maps down status to monitor.down event", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);
    expect(mockQueueAdd.mock.calls[0][1].payload.event).toBe("monitor.down");
  });

  it("maps up status to monitor.up event", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult({ ...baseMonitor, status: "down" }, upResult);
    expect(mockQueueAdd.mock.calls[0][1].payload.event).toBe("monitor.up");
  });

  it("maps degraded status to monitor.degraded event", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult(
      { ...baseMonitor, status: "up" },
      { ...upResult, status: "degraded" }
    );
    expect(mockQueueAdd.mock.calls[0][1].payload.event).toBe("monitor.degraded");
  });
});
