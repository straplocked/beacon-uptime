import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { performDnsCheck } from "./dns";

vi.mock("dns/promises", () => ({
  resolve: vi.fn(),
  lookup: vi.fn(),
}));

import * as dns from "dns/promises";

describe("performDnsCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up when DNS resolves successfully", async () => {
    vi.mocked(dns.resolve).mockResolvedValue(["1.2.3.4"]);

    const result = await performDnsCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.errorMessage).toBeNull();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns down when no records found", async () => {
    vi.mocked(dns.resolve).mockResolvedValue([]);

    const result = await performDnsCheck({
      target: "no-records.example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toBe("No DNS records found");
  });

  it("returns down on DNS resolution failure", async () => {
    vi.mocked(dns.resolve).mockRejectedValue(
      new Error("queryA ENOTFOUND bad-domain.xyz")
    );

    const result = await performDnsCheck({
      target: "bad-domain.xyz",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("ENOTFOUND");
  });

  it("returns down on timeout", async () => {
    // Simulate a very slow resolve that exceeds the timeout
    vi.mocked(dns.resolve).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(["1.2.3.4"]), 5000))
    );

    const result = await performDnsCheck({
      target: "slow.example.com",
      timeoutMs: 50, // Very short timeout
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("timeout");
  });

  it("calls dns.resolve with the correct target", async () => {
    vi.mocked(dns.resolve).mockResolvedValue(["1.2.3.4"]);

    await performDnsCheck({
      target: "google.com",
      timeoutMs: 5000,
    });

    expect(dns.resolve).toHaveBeenCalledWith("google.com");
  });

  it("handles multiple addresses", async () => {
    vi.mocked(dns.resolve).mockResolvedValue(["1.1.1.1", "1.0.0.1"]);

    const result = await performDnsCheck({
      target: "cloudflare.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
  });

  describe("ALLOW_PRIVATE_TARGETS (SSRF guard, Vikunja 804)", () => {
    const original = process.env.ALLOW_PRIVATE_TARGETS;

    afterEach(() => {
      if (original === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
      else process.env.ALLOW_PRIVATE_TARGETS = original;
    });

    it("resolves a private-address target by default (unset)", async () => {
      delete process.env.ALLOW_PRIVATE_TARGETS;
      vi.mocked(dns.resolve).mockResolvedValue(["192.168.1.1"]);

      const result = await performDnsCheck({ target: "192.168.1.1", timeoutMs: 5000 });

      expect(result.status).toBe("up");
      expect(dns.resolve).toHaveBeenCalled();
    });

    it("blocks a private-address target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      vi.mocked(dns.resolve).mockClear();

      const result = await performDnsCheck({ target: "192.168.1.1", timeoutMs: 5000 });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/private or reserved/);
      expect(dns.resolve).not.toHaveBeenCalled();
    });

    it("still resolves a public target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      vi.mocked(dns.resolve).mockResolvedValue(["8.8.4.4"]);

      const result = await performDnsCheck({ target: "8.8.8.8", timeoutMs: 5000 });

      expect(result.status).toBe("up");
    });
  });
});
