import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "dns/promises";

import {
  assertHostIsPublic,
  isBlockedAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  SafeFetchError,
} from "./safe-fetch";

describe("isBlockedIpv4", () => {
  const blocked = [
    ["0.0.0.0", "this-network"],
    ["10.0.0.1", "private class A"],
    ["10.255.255.255", "private class A upper"],
    ["100.64.0.1", "CGNAT"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback upper"],
    ["169.254.169.254", "cloud metadata"],
    ["172.16.0.1", "private class B lower"],
    ["172.31.255.255", "private class B upper"],
    ["192.0.0.1", "IETF assignments"],
    ["192.0.2.5", "TEST-NET-1"],
    ["192.88.99.1", "6to4 relay"],
    ["192.168.1.1", "private class C"],
    ["198.18.0.1", "benchmarking"],
    ["198.51.100.7", "TEST-NET-2"],
    ["203.0.113.9", "TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ] as const;

  for (const [ip, label] of blocked) {
    it(`blocks ${ip} (${label})`, () => {
      expect(isBlockedIpv4(ip)).toBe(true);
    });
  }

  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255",
    "172.32.0.1",
    "93.184.216.34",
    "100.63.255.255",
  ];
  for (const ip of allowed) {
    it(`allows public ${ip}`, () => {
      expect(isBlockedIpv4(ip)).toBe(false);
    });
  }

  it("refuses unparseable input rather than defaulting to allow", () => {
    expect(isBlockedIpv4("not-an-ip")).toBe(true);
    expect(isBlockedIpv4("1.2.3")).toBe(true);
    expect(isBlockedIpv4("999.1.1.1")).toBe(true);
  });
});

describe("isBlockedIpv6", () => {
  const blocked = [
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["::ffff:127.0.0.1", "v4-mapped loopback"],
    ["::ffff:169.254.169.254", "v4-mapped metadata"],
    ["::ffff:10.0.0.1", "v4-mapped private"],
    ["64:ff9b::127.0.0.1", "NAT64 loopback"],
  ] as const;

  for (const [ip, label] of blocked) {
    it(`blocks ${ip} (${label})`, () => {
      expect(isBlockedIpv6(ip)).toBe(true);
    });
  }

  const allowed = [
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ];
  for (const ip of allowed) {
    it(`allows public ${ip}`, () => {
      expect(isBlockedIpv6(ip)).toBe(false);
    });
  }

  it("strips a zone index before evaluating", () => {
    expect(isBlockedIpv6("fe80::1%eth0")).toBe(true);
  });

  it("refuses unparseable input", () => {
    expect(isBlockedIpv6("gggg::1")).toBe(true);
  });
});

describe("isBlockedAddress", () => {
  it("dispatches on address family", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});

describe("assertHostIsPublic", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it("accepts a hostname resolving only to public addresses", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    await expect(assertHostIsPublic("example.com")).resolves.toBeUndefined();
  });

  it("rejects a hostname resolving to a private address", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "192.168.1.10", family: 4 },
    ] as never);
    await expect(assertHostIsPublic("internal.example")).rejects.toThrow(
      SafeFetchError,
    );
  });

  it("rejects when ANY resolved address is private", async () => {
    // A split-horizon record that mixes a decoy public IP with a private one
    // must not slip through.
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ] as never);
    await expect(assertHostIsPublic("rebind.example")).rejects.toThrow(
      /private or reserved/,
    );
  });

  it("validates bare IPv4 literals without a DNS round-trip", async () => {
    await expect(assertHostIsPublic("127.0.0.1")).rejects.toThrow(
      /private or reserved/,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("validates bracketed IPv6 literals", async () => {
    await expect(assertHostIsPublic("[::1]")).rejects.toThrow(
      /private or reserved/,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("surfaces resolution failures as dns_failure", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertHostIsPublic("nope.invalid")).rejects.toMatchObject({
      code: "dns_failure",
    });
  });

  it("treats an empty resolution as a failure", async () => {
    vi.mocked(lookup).mockResolvedValue([] as never);
    await expect(assertHostIsPublic("empty.example")).rejects.toMatchObject({
      code: "dns_failure",
    });
  });
});
