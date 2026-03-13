export const edition = {
  isSaaS: process.env.BEACON_EDITION === "saas",
  enforcePlanLimits: process.env.BEACON_EDITION === "saas",
  showOrgSwitcher: process.env.BEACON_EDITION === "saas",
  showBilling: process.env.BEACON_EDITION === "saas",
  showTeamManagement: process.env.BEACON_EDITION === "saas",
};
