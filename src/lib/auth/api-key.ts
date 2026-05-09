import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Org = typeof organizations.$inferSelect;

/**
 * Resolve a `Bearer bk_...` Authorization header to the owning organization.
 * Returns null on missing/invalid header or unknown key.
 */
export async function resolveApiKey(
  authHeader: string | null,
): Promise<Org | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) return null;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.apiKey, apiKey))
    .limit(1);

  return org ?? null;
}

/** NextRequest convenience wrapper used by /api/v1/* routes. */
export async function getApiKeyOrg(request: NextRequest): Promise<Org | null> {
  return resolveApiKey(request.headers.get("authorization"));
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "bk_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
