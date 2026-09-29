import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "dns/promises";

import { allowPrivateTargets, assertTargetAllowed } from "./target-policy";
import { SafeFetchError } from "./safe-fetch";

describe("allowPrivateTargets", () => {
  const original = process.env.ALLOW_PRIVATE_TARGETS;
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
    else process.env.ALLOW_PRIVATE_TARGETS = original;
  });

  it("defaults to true when unset", () => {
    delete process.env.ALLOW_PRIVATE_TARGETS;
    expect(allowPrivateTargets()).toBe(true);
  });

  it("is true for any value other than the literal 'false'", () => {
    for (const value of ["true", "", "0", "False", "no"]) {
      process.env.ALLOW_PRIVATE_TARGETS = value;
      expect(allowPrivateTargets()).toBe(true);
    }
  });

  it("is false only when set to exactly 'false'", () => {
    process.env.ALLOW_PRIVATE_TARGETS = "false";
    expect(allowPrivateTargets()).toBe(false);
  });
});

describe("assertTargetAllowed", () => {
  const original = process.env.ALLOW_PRIVATE_TARGETS;

  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
    else process.env.ALLOW_PRIVATE_TARGETS = original;
  });

  it("is a no-op when private targets are allowed (the default)", async () => {
    delete process.env.ALLOW_PRIVATE_TARGETS;
    await expect(assertTargetAllowed("192.168.1.1")).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a private IP literal when private targets are disallowed", async () => {
    process.env.ALLOW_PRIVATE_TARGETS = "false";
    await expect(assertTargetAllowed("192.168.1.1")).rejects.toThrow(SafeFetchError);
    // An IP literal never needs a DNS round trip to classify.
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a public IP literal when private targets are disallowed", async () => {
    process.env.ALLOW_PRIVATE_TARGETS = "false";
    await expect(assertTargetAllowed("8.8.8.8")).resolves.toBeUndefined();
  });

  it("rejects a hostname that resolves to a private address when disallowed", async () => {
    process.env.ALLOW_PRIVATE_TARGETS = "false";
    vi.mocked(lookup).mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    await expect(assertTargetAllowed("internal.example")).rejects.toThrow(SafeFetchError);
  });

  it("allows a hostname that resolves to a public address when disallowed", async () => {
    process.env.ALLOW_PRIVATE_TARGETS = "false";
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertTargetAllowed("example.com")).resolves.toBeUndefined();
  });
});
