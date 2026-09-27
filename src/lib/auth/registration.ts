/**
 * Who may create an account.
 *
 * A self-hosted Beacon is usually one operator on a public URL. If anyone can
 * register, anyone can point monitors at the operator's LAN from the
 * operator's own box. So registration is open only while the install has no
 * users: the first person to register claims it, and after that it is closed
 * unless ALLOW_REGISTRATION=true.
 */
export function isRegistrationOpen(
  existingUserCount: number,
  allowRegistration: string | undefined = process.env.ALLOW_REGISTRATION,
): boolean {
  if (existingUserCount === 0) return true;
  return allowRegistration?.trim().toLowerCase() === "true";
}
