export type MemberRole = "owner" | "admin" | "member" | "viewer";

export function canManageMembers(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

export function canEditResources(role: MemberRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canDeleteOrg(role: MemberRole): boolean {
  return role === "owner";
}

export function canManageBilling(role: MemberRole): boolean {
  return role === "owner";
}
