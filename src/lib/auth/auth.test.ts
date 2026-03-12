import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./index";
import { sha256 } from "./crypto";

describe("sha256", () => {
  it("returns a 64-character hex string", async () => {
    const hash = await sha256("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces consistent output for the same input", async () => {
    const hash1 = await sha256("test-input");
    const hash2 = await sha256("test-input");
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different inputs", async () => {
    const hash1 = await sha256("input-a");
    const hash2 = await sha256("input-b");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", async () => {
    const hash = await sha256("");
    expect(hash).toHaveLength(64);
    // Known SHA-256 of empty string
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

describe("hashPassword", () => {
  it("returns salt:hash format", async () => {
    const result = await hashPassword("my-password");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    // Salt is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    // Hash is 256 bits = 32 bytes = 64 hex chars
    expect(parts[1]).toHaveLength(64);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    expect(result).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    expect(result).toBe(false);
  });

  it("handles special characters", async () => {
    const password = "p@$$w0rd!#%^&*()_+{}|:<>?";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password + "x", hash)).toBe(false);
  });

  it("handles unicode characters", async () => {
    const password = "mot-de-passe-francais-ete";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("handles empty password", async () => {
    const hash = await hashPassword("");
    expect(await verifyPassword("", hash)).toBe(true);
    expect(await verifyPassword("non-empty", hash)).toBe(false);
  });
});
