import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every `can*` gate in plans.ts short-circuits on `edition.enforcePlanLimits`,
 * which is only true when BEACON_EDITION=saas. These tests therefore have to
 * pick an edition explicitly — before this mock existed they asserted SaaS
 * behavior while running under the OSS default, and had been failing since
 * the OSS/premium split (3f15e31).
 *
 * Both editions are covered: OSS must stay fully permissive (that is the
 * point of self-hosting), SaaS must actually enforce the tier limits.
 */
const mockEdition = vi.hoisted(() => ({
  isSaaS: true,
  enforcePlanLimits: true,
  showOrgSwitcher: true,
  showBilling: true,
  showTeamManagement: true,
}));

vi.mock("@/lib/edition", () => ({ edition: mockEdition }));

import {
  PLAN_LIMITS,
  getPlanLimits,
  canAddMonitor,
  canAddStatusPage,
  getMinCheckInterval,
  canUseCustomDomain,
  canUseCustomCss,
  canUseApi,
  canAddNotificationChannel,
  canAddMember,
} from "./plans";
import type { PlanType } from "./plans";

const ALL_PLANS: PlanType[] = ["free", "pro", "team"];

function setEdition(kind: "saas" | "oss") {
  const saas = kind === "saas";
  mockEdition.isSaaS = saas;
  mockEdition.enforcePlanLimits = saas;
  mockEdition.showOrgSwitcher = saas;
  mockEdition.showBilling = saas;
  mockEdition.showTeamManagement = saas;
}

beforeEach(() => setEdition("saas"));

/* ─── Edition-independent: the limit table itself ───────────── */

describe("PLAN_LIMITS", () => {
  it("defines all three plan tiers", () => {
    expect(PLAN_LIMITS).toHaveProperty("free");
    expect(PLAN_LIMITS).toHaveProperty("pro");
    expect(PLAN_LIMITS).toHaveProperty("team");
  });

  it("free plan has correct limits", () => {
    const free = PLAN_LIMITS.free;
    expect(free.monitors).toBe(3);
    expect(free.checkIntervalSeconds).toBe(300);
    expect(free.statusPages).toBe(1);
    expect(free.customDomain).toBe(false);
    expect(free.apiAccess).toBe(false);
    expect(free.notificationChannels).toBe(1);
    expect(free.dataRetentionDays).toBe(7);
    expect(free.subscriberNotifications).toBe(false);
    expect(free.floatingWidget).toBe(false);
  });

  it("pro plan unlocks premium features", () => {
    const pro = PLAN_LIMITS.pro;
    expect(pro.monitors).toBe(25);
    expect(pro.checkIntervalSeconds).toBe(60);
    expect(pro.statusPages).toBe(3);
    expect(pro.customDomain).toBe(true);
    expect(pro.apiAccess).toBe(true);
    expect(pro.notificationChannels).toBe("unlimited");
    expect(pro.subscriberNotifications).toBe(true);
    expect(pro.floatingWidget).toBe(true);
  });

  it("team plan has highest limits", () => {
    const team = PLAN_LIMITS.team;
    expect(team.monitors).toBe(100);
    expect(team.checkIntervalSeconds).toBe(30);
    expect(team.statusPages).toBe(10);
    expect(team.teamMembers).toBe(5);
    expect(team.dataRetentionDays).toBe(90);
  });

  it("plan tiers are strictly ordered by monitor count", () => {
    expect(PLAN_LIMITS.free.monitors).toBeLessThan(PLAN_LIMITS.pro.monitors);
    expect(PLAN_LIMITS.pro.monitors).toBeLessThan(PLAN_LIMITS.team.monitors);
  });

  it("plan tiers are strictly ordered by check interval (lower = better)", () => {
    expect(PLAN_LIMITS.free.checkIntervalSeconds).toBeGreaterThan(
      PLAN_LIMITS.pro.checkIntervalSeconds,
    );
    expect(PLAN_LIMITS.pro.checkIntervalSeconds).toBeGreaterThan(
      PLAN_LIMITS.team.checkIntervalSeconds,
    );
  });
});

describe("getPlanLimits", () => {
  it("returns correct limits for each plan", () => {
    expect(getPlanLimits("free")).toBe(PLAN_LIMITS.free);
    expect(getPlanLimits("pro")).toBe(PLAN_LIMITS.pro);
    expect(getPlanLimits("team")).toBe(PLAN_LIMITS.team);
  });
});

/* ─── SaaS edition: gates enforce the table ─────────────────── */

describe("SaaS edition (enforcePlanLimits = true)", () => {
  describe("canAddMonitor", () => {
    it("allows adding monitors under the limit", () => {
      expect(canAddMonitor("free", 0)).toBe(true);
      expect(canAddMonitor("free", 2)).toBe(true);
      expect(canAddMonitor("pro", 24)).toBe(true);
      expect(canAddMonitor("team", 99)).toBe(true);
    });

    it("blocks adding monitors at or over the limit", () => {
      expect(canAddMonitor("free", 3)).toBe(false);
      expect(canAddMonitor("free", 5)).toBe(false);
      expect(canAddMonitor("pro", 25)).toBe(false);
      expect(canAddMonitor("team", 100)).toBe(false);
    });

    it("handles zero monitors", () => {
      for (const plan of ALL_PLANS) {
        expect(canAddMonitor(plan, 0)).toBe(true);
      }
    });
  });

  describe("canAddStatusPage", () => {
    it("allows under the limit", () => {
      expect(canAddStatusPage("free", 0)).toBe(true);
      expect(canAddStatusPage("pro", 2)).toBe(true);
      expect(canAddStatusPage("team", 9)).toBe(true);
    });

    it("blocks at the limit", () => {
      expect(canAddStatusPage("free", 1)).toBe(false);
      expect(canAddStatusPage("pro", 3)).toBe(false);
      expect(canAddStatusPage("team", 10)).toBe(false);
    });
  });

  describe("getMinCheckInterval", () => {
    it("returns correct intervals per plan", () => {
      expect(getMinCheckInterval("free")).toBe(300);
      expect(getMinCheckInterval("pro")).toBe(60);
      expect(getMinCheckInterval("team")).toBe(30);
    });
  });

  describe("canUseCustomDomain", () => {
    it("free cannot use custom domains", () => {
      expect(canUseCustomDomain("free")).toBe(false);
    });

    it("pro and team can use custom domains", () => {
      expect(canUseCustomDomain("pro")).toBe(true);
      expect(canUseCustomDomain("team")).toBe(true);
    });
  });

  describe("canUseCustomCss", () => {
    it("free cannot use custom CSS", () => {
      expect(canUseCustomCss("free")).toBe(false);
    });

    it("pro and team can use custom CSS", () => {
      expect(canUseCustomCss("pro")).toBe(true);
      expect(canUseCustomCss("team")).toBe(true);
    });
  });

  describe("canUseApi", () => {
    it("free cannot use API", () => {
      expect(canUseApi("free")).toBe(false);
    });

    it("pro and team can use API", () => {
      expect(canUseApi("pro")).toBe(true);
      expect(canUseApi("team")).toBe(true);
    });
  });

  describe("canAddNotificationChannel", () => {
    it("free plan allows up to 1 channel", () => {
      expect(canAddNotificationChannel("free", 0)).toBe(true);
      expect(canAddNotificationChannel("free", 1)).toBe(false);
      expect(canAddNotificationChannel("free", 5)).toBe(false);
    });

    it("pro and team plans allow unlimited channels", () => {
      expect(canAddNotificationChannel("pro", 0)).toBe(true);
      expect(canAddNotificationChannel("pro", 100)).toBe(true);
      expect(canAddNotificationChannel("team", 1000)).toBe(true);
    });
  });

  describe("canAddMember", () => {
    it("free and pro are single-seat", () => {
      expect(canAddMember("free", 1)).toBe(false);
      expect(canAddMember("pro", 1)).toBe(false);
    });

    it("team seats up to 5", () => {
      expect(canAddMember("team", 4)).toBe(true);
      expect(canAddMember("team", 5)).toBe(false);
    });
  });
});

/* ─── OSS edition: self-hosters get everything ──────────────── */

describe("OSS edition (enforcePlanLimits = false)", () => {
  beforeEach(() => setEdition("oss"));

  it("never caps monitor count", () => {
    for (const plan of ALL_PLANS) {
      expect(canAddMonitor(plan, 0)).toBe(true);
      expect(canAddMonitor(plan, 10_000)).toBe(true);
    }
  });

  it("never caps status pages", () => {
    for (const plan of ALL_PLANS) {
      expect(canAddStatusPage(plan, 999)).toBe(true);
    }
  });

  it("never caps notification channels or members", () => {
    for (const plan of ALL_PLANS) {
      expect(canAddNotificationChannel(plan, 999)).toBe(true);
      expect(canAddMember(plan, 999)).toBe(true);
    }
  });

  it("unlocks premium feature flags on every plan", () => {
    for (const plan of ALL_PLANS) {
      expect(canUseCustomDomain(plan)).toBe(true);
      expect(canUseCustomCss(plan)).toBe(true);
      expect(canUseApi(plan)).toBe(true);
    }
  });

  it("allows the fastest check interval regardless of plan", () => {
    for (const plan of ALL_PLANS) {
      expect(getMinCheckInterval(plan)).toBe(30);
    }
  });

  it("still exposes the limit table for display purposes", () => {
    // The Settings page renders these numbers even when it doesn't enforce them.
    expect(getPlanLimits("free").monitors).toBe(3);
  });
});
