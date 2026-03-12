import { describe, it, expect } from "vitest";
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
} from "./plans";
import type { PlanType } from "./plans";

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
      PLAN_LIMITS.pro.checkIntervalSeconds
    );
    expect(PLAN_LIMITS.pro.checkIntervalSeconds).toBeGreaterThan(
      PLAN_LIMITS.team.checkIntervalSeconds
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
    const plans: PlanType[] = ["free", "pro", "team"];
    for (const plan of plans) {
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
