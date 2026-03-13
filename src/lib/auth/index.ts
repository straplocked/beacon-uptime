import { db } from "@/lib/db";
import { users, sessions, organizations, organizationMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sha256 } from "./crypto";
import { cookies } from "next/headers";
import type { MemberRole } from "./permissions";

const SESSION_COOKIE_NAME = "beacon_session";
const ORG_COOKIE_NAME = "beacon_org";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Password Hashing ───────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  // Using Web Crypto API for password hashing
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, expectedHash] = storedHash.split(":");
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex === expectedHash;
}

// ─── Session Management ─────────────────────────────────────────

function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return sessionId;
}

export async function getSession(sessionId: string) {
  const result = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (result.length === 0) return null;

  const { session, user } = result[0];

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return { session, user };
}

export async function deleteSession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// ─── Auth Helpers ───────────────────────────────────────────────

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) return null;

  const result = await getSession(sessionCookie.value);
  return result?.user ?? null;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getOrgCookieName() {
  return ORG_COOKIE_NAME;
}

export function getSessionDurationMs() {
  return SESSION_DURATION_MS;
}

// ─── Organization Auth Context ─────────────────────────────────

export interface AuthContext {
  user: typeof users.$inferSelect;
  organization: typeof organizations.$inferSelect;
  membership: typeof organizationMembers.$inferSelect;
  role: MemberRole;
}

/**
 * Returns the authenticated user + their active organization + membership.
 * Active org is determined by the beacon_org cookie, defaulting to first org.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const orgCookie = cookieStore.get(ORG_COOKIE_NAME);
  const requestedOrgId = orgCookie?.value;

  let membership;

  if (requestedOrgId) {
    // Try to find membership for the requested org
    const [found] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, requestedOrgId)
        )
      )
      .limit(1);
    membership = found;
  }

  if (!membership) {
    // Fall back to user's first org
    const [found] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);
    membership = found;
  }

  if (!membership) return null;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  if (!org) return null;

  return {
    user,
    organization: org,
    membership,
    role: membership.role as MemberRole,
  };
}
