export type PlanType = "free" | "pro" | "team";

export interface PlanLimits {
  monitors: number;
  checkIntervalSeconds: number;
  statusPages: number;
  customDomain: boolean;
  teamMembers: number;
  notificationChannels: number | "unlimited";
  customCss: boolean;
  apiAccess: boolean;
  incidentHistoryDays: number;
  dataRetentionDays: number;
  subscriberNotifications: boolean;
  floatingWidget: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    monitors: 3,
    checkIntervalSeconds: 300, // 5 min
    statusPages: 1,
    customDomain: false,
    teamMembers: 1,
    notificationChannels: 1,
    customCss: false,
    apiAccess: false,
    incidentHistoryDays: 7,
    dataRetentionDays: 7,
    subscriberNotifications: false,
    floatingWidget: false,
  },
  pro: {
    monitors: 25,
    checkIntervalSeconds: 60, // 1 min
    statusPages: 3,
    customDomain: true,
    teamMembers: 1,
    notificationChannels: "unlimited",
    customCss: true,
    apiAccess: true,
    incidentHistoryDays: 90,
    dataRetentionDays: 30,
    subscriberNotifications: true,
    floatingWidget: true,
  },
  team: {
    monitors: 100,
    checkIntervalSeconds: 30, // 30 sec
    statusPages: 10,
    customDomain: true,
    teamMembers: 5,
    notificationChannels: "unlimited",
    customCss: true,
    apiAccess: true,
    incidentHistoryDays: 365,
    dataRetentionDays: 90,
    subscriberNotifications: true,
    floatingWidget: true,
  },
};

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canAddMonitor(
  plan: PlanType,
  currentMonitorCount: number
): boolean {
  return currentMonitorCount < PLAN_LIMITS[plan].monitors;
}

export function canAddStatusPage(
  plan: PlanType,
  currentPageCount: number
): boolean {
  return currentPageCount < PLAN_LIMITS[plan].statusPages;
}

export function getMinCheckInterval(plan: PlanType): number {
  return PLAN_LIMITS[plan].checkIntervalSeconds;
}

export function canUseCustomDomain(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].customDomain;
}

export function canUseCustomCss(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].customCss;
}

export function canUseApi(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].apiAccess;
}

export function canAddNotificationChannel(
  plan: PlanType,
  currentChannelCount: number
): boolean {
  const limit = PLAN_LIMITS[plan].notificationChannels;
  if (limit === "unlimited") return true;
  return currentChannelCount < limit;
}

export function canAddMember(
  plan: PlanType,
  currentMemberCount: number
): boolean {
  return currentMemberCount < PLAN_LIMITS[plan].teamMembers;
}
