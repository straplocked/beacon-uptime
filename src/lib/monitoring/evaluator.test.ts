import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  organizations: { id: "organizations.id", plan: "organizations.plan" },
  notificationChannels: { organizationId: "notificationChannels.organizationId" },
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

import * as schema from "@/lib/db/schema";

import { processCheckResult } from "./evaluator";

const baseMonitor = {
  id: "mon-1",
  organizationId: "org-1",
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
    mockDbSelect.mockImplementation(() => {
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

/* ────────────────────────────────────────────────────────────────
 * E5 — retry / confirmation policy.
 *
 * `monitor.confirmationCount` consecutive failing checks are required
 * before a monitor transitions to down/degraded and an incident opens.
 * These tests drive db.update()'s `.set()` payload directly (rather than
 * just checking notification counts) so a regression that silently
 * re-confirms on failure #1 — or never confirms at all — shows up here.
 * ──────────────────────────────────────────────────────────────── */

describe("confirmation / retry policy (E5)", () => {
  let updateCalls: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls = [];
    mockDbUpdate.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        updateCalls.push(payload);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    }));
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "incident-1", title: "Test is down" }]),
        then: (resolve: any) => Promise.resolve().then(resolve),
      }),
    });
    mockDbSelect.mockReturnValue(chainable([]));
  });

  it("N-1 consecutive failures: monitor status is NOT changed and no incident/notification fires", async () => {
    // confirmationCount 3, already at 1 consecutive failure -> this failure
    // brings it to 2, still short of the threshold of 3.
    await processCheckResult(
      {
        ...baseMonitor,
        status: "up",
        confirmationCount: 3,
        consecutiveFailures: 1,
      },
      downResult
    );

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("up"); // unchanged — unconfirmed
    expect(updateCalls[0].consecutiveFailures).toBe(2);
    expect(updateCalls[0].nextCheckAt).not.toBeNull(); // retry scheduled sooner
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("Nth consecutive failure confirms the transition to down and triggers notifications", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]); // no linked status pages
      return chainable([
        { id: "ch-1", type: "email", config: { email: "test@example.com" } },
      ]);
    });

    // confirmationCount 3, already at 2 consecutive failures -> this failure
    // is the 3rd, hitting the threshold.
    await processCheckResult(
      {
        ...baseMonitor,
        status: "up",
        confirmationCount: 3,
        consecutiveFailures: 2,
      },
      downResult
    );

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("down"); // confirmed
    expect(updateCalls[0].consecutiveFailures).toBe(3);
    expect(updateCalls[0].nextCheckAt).toBeNull(); // back to normal cadence
    expect(mockQueueAdd).toHaveBeenCalled();
    const [, jobData] = mockQueueAdd.mock.calls[0];
    expect(jobData.payload.event).toBe("monitor.down");
  });

  it("a successful check resets consecutiveFailures to 0 and recovers immediately, regardless of confirmationCount", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]); // no linked status pages
      return chainable([
        { id: "ch-1", type: "email", config: { email: "test@example.com" } },
      ]);
    });

    await processCheckResult(
      {
        ...baseMonitor,
        status: "down",
        confirmationCount: 5,
        consecutiveFailures: 4, // was one short of ever confirming again
      },
      upResult
    );

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("up"); // recovery is immediate
    expect(updateCalls[0].consecutiveFailures).toBe(0);
    expect(updateCalls[0].nextCheckAt).toBeNull();
    expect(mockQueueAdd).toHaveBeenCalled();
    const [, jobData] = mockQueueAdd.mock.calls[0];
    expect(jobData.payload.event).toBe("monitor.up");
  });

  it("confirmationCount 1 (migrated existing monitors) preserves immediate down on the first failure", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([]);
      return chainable([{ id: "ch-1", type: "webhook", config: {} }]);
    });

    await processCheckResult(
      { ...baseMonitor, status: "up", confirmationCount: 1, consecutiveFailures: 0 },
      downResult
    );

    expect(updateCalls[0].status).toBe("down");
    expect(updateCalls[0].consecutiveFailures).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalled();
  });

  it("defaults confirmationCount to 1 (immediate) when not provided at all", async () => {
    // Guards against a regression that silently starts requiring
    // confirmation for callers that don't pass the new fields.
    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);
    expect(updateCalls[0].status).toBe("down");
  });
});

/* ────────────────────────────────────────────────────────────────
 * NAMED GUARD — subscriber notifications are unconditional.
 *
 * Until the OSS-only change, `enqueueSubscriberNotifications` read
 * `organizations.plan` and silently returned when the plan lacked
 * `subscriberNotifications` (i.e. the "free" plan). There is now one
 * edition and no plan gating, so the subscriber-email path must be
 * reached for an organization whose `plan` column still says "free".
 *
 * The `organizations` row below is deliberately still seeded with
 * plan: "free" — if anyone re-introduces a plan gate here, these tests
 * go red instead of quietly dropping subscriber mail.
 * ──────────────────────────────────────────────────────────────── */

/** Minimal stand-in for the drizzle select chain used by the evaluator. */
interface SelectChainStub {
  where: () => SelectChainStub;
  limit: (n?: number) => Promise<unknown[]>;
  orderBy: (...args: unknown[]) => Promise<unknown[]>;
  then: (
    resolve: (rows: unknown[]) => unknown,
    reject?: (err: unknown) => unknown,
  ) => Promise<unknown>;
}

/** db.select() mock that dispatches on the table passed to .from(). */
function selectByTable(rowsByTable: Map<unknown, unknown[]>) {
  return () => ({
    from: vi.fn((table: unknown) => {
      const rows = rowsByTable.get(table) ?? [];
      const sub: SelectChainStub = {
        where: () => sub,
        limit: () => Promise.resolve(rows),
        orderBy: () => Promise.resolve(rows),
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
      };
      return sub;
    }),
  });
}

describe("subscriber notifications (no plan gating)", () => {
  const originalBaseUrl = process.env.BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    process.env.BASE_URL = "https://status.example.test";

    mockDbSelect.mockImplementation(
      selectByTable(
        new Map<unknown, unknown[]>([
          // The monitor is on one status page, so an auto-incident is created.
          [schema.statusPageMonitors, [{ statusPageId: "page-1" }]],
          // No open incident on that page yet.
          [schema.incidents, []],
          [schema.statusPages, [{ slug: "acme", name: "Acme Status" }]],
          [
            schema.subscribers,
            [
              {
                id: "sub-1",
                email: "watcher@example.test",
                confirmationToken: "tok-abc",
              },
            ],
          ],
          // The org is still on the plan the old code suppressed.
          [schema.organizations, [{ plan: "free" }]],
          // No org notification channels, so the only queued job is the
          // subscriber email.
          [schema.notificationChannels, []],
        ]),
      ),
    );
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalBaseUrl;
  });

  it('enqueues a subscriber email for an organization whose plan is still "free"', async () => {
    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);

    const [jobName, jobData, opts] = mockQueueAdd.mock.calls[0];

    // Assert the wrong answer first: this must NOT be an org-channel job.
    expect(jobName).not.toBe("notify-email-ch-1");
    expect(jobData.type).not.toBe(undefined);

    // Hand-written expectations — not derived from the evaluator's own code.
    expect(jobName).toBe("subscriber-notify-sub-1");
    expect(jobData).toEqual({
      type: "subscriber-notification",
      email: "watcher@example.test",
      pageName: "Acme Status",
      incidentTitle: "Test is down",
      incidentMessage: "Automated alert: Internal Server Error",
      statusPageUrl: "https://status.example.test/s/acme",
      unsubscribeUrl:
        "https://status.example.test/api/public/unsubscribe/tok-abc",
    });
    expect(opts).toEqual({ priority: 2 });
  });

  it("never reads organizations.plan on the subscriber path", async () => {
    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    const tablesQueried = mockDbSelect.mock.results.flatMap((r) => {
      const stub = r.value as { from: { mock: { calls: unknown[][] } } };
      return stub.from.mock.calls.map((call) => call[0]);
    });
    expect(tablesQueried).toContain(schema.subscribers);
    expect(tablesQueried).not.toContain(schema.organizations);
  });

  it("enqueues nothing when the status page has no confirmed subscribers", async () => {
    mockDbSelect.mockImplementation(
      selectByTable(
        new Map<unknown, unknown[]>([
          [schema.statusPageMonitors, [{ statusPageId: "page-1" }]],
          [schema.incidents, []],
          [schema.statusPages, [{ slug: "acme", name: "Acme Status" }]],
          [schema.subscribers, []],
          [schema.notificationChannels, []],
        ]),
      ),
    );

    await processCheckResult({ ...baseMonitor, status: "up" }, downResult);

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
