import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { performPingCheck, isValidPingTarget } from "./ping";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";

describe("performPingCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up on successful ping", async () => {
    vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
      cb(
        null,
        "PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.\n64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=4.25 ms\n",
        ""
      );
      return {} as any;
    }) as any);

    const result = await performPingCheck({
      target: "1.1.1.1",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBe(4);
    expect(result.errorMessage).toBeNull();
  });

  it("extracts response time from ping output", async () => {
    vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
      cb(
        null,
        "64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=12.8 ms",
        ""
      );
      return {} as any;
    }) as any);

    const result = await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBe(13); // Math.round(12.8)
  });

  it("handles time<1 ms format", async () => {
    vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
      cb(
        null,
        "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time<1 ms",
        ""
      );
      return {} as any;
    }) as any);

    const result = await performPingCheck({
      target: "127.0.0.1",
      timeoutMs: 5000,
    });

    // time<1 won't match the regex time=X, so falls back to elapsed time
    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns down on ping failure", async () => {
    vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
      cb(new Error("Command failed"), "", "ping: bad-host: Name or service not known");
      return {} as any;
    }) as any);

    const result = await performPingCheck({
      target: "bad-host",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Name or service not known");
  });

  it("returns down with error message when stderr is empty", async () => {
    vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
      cb(new Error("Command failed: exit code 1"), "", "");
      return {} as any;
    }) as any);

    const result = await performPingCheck({
      target: "unreachable.host",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Command failed");
  });

  it("constructs correct ping command with timeout", async () => {
    vi.mocked(execFile).mockImplementation(((file: any, args: any, _opts: any, cb: any) => {
      expect([file, ...args].join(" ")).toBe("ping -c 1 -W 5 8.8.8.8");
      cb(null, "64 bytes from 8.8.8.8: time=10.0 ms", "");
      return {} as any;
    }) as any);

    await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 5000,
    });
  });

  it("rounds timeout up to nearest second", async () => {
    vi.mocked(execFile).mockImplementation(((file: any, args: any, _opts: any, cb: any) => {
      expect([file, ...args].join(" ")).toBe("ping -c 1 -W 3 8.8.8.8");
      cb(null, "64 bytes from 8.8.8.8: time=10.0 ms", "");
      return {} as any;
    }) as any);

    await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 2500,
    });
  });

  it("refuses shell metacharacters and option injection without running ping", async () => {
    for (const target of ["1.1.1.1; id", "$(id)", "a`id`", "-f 1.1.1.1", "host name", ""]) {
      expect(isValidPingTarget(target)).toBe(false);
      vi.mocked(execFile).mockClear();
      const result = await performPingCheck({ target, timeoutMs: 1000 });
      expect(result.status).toBe("down");
      expect(execFile).not.toHaveBeenCalled();
    }
  });

  it("accepts hostnames, IPv4 and IPv6 literals", () => {
    for (const target of ["example.com", "192.168.1.1", "2606:4700:4700::1111", "nas-01.local"]) {
      expect(isValidPingTarget(target)).toBe(true);
    }
  });

  describe("ALLOW_PRIVATE_TARGETS (SSRF guard, Vikunja 804)", () => {
    const original = process.env.ALLOW_PRIVATE_TARGETS;

    afterEach(() => {
      if (original === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
      else process.env.ALLOW_PRIVATE_TARGETS = original;
    });

    it("pings a private target by default (unset)", async () => {
      delete process.env.ALLOW_PRIVATE_TARGETS;
      vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
        cb(null, "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.0 ms", "");
        return {} as any;
      }) as any);

      const result = await performPingCheck({ target: "192.168.1.1", timeoutMs: 5000 });

      expect(result.status).toBe("up");
      expect(execFile).toHaveBeenCalled();
    });

    it("blocks a private target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      vi.mocked(execFile).mockClear();

      const result = await performPingCheck({ target: "192.168.1.1", timeoutMs: 5000 });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/private or reserved/);
      expect(execFile).not.toHaveBeenCalled();
    });

    it("still pings a public target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      vi.mocked(execFile).mockImplementation(((_file: any, _args: any, _opts: any, cb: any) => {
        cb(null, "64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=12.8 ms", "");
        return {} as any;
      }) as any);

      const result = await performPingCheck({ target: "8.8.8.8", timeoutMs: 5000 });

      expect(result.status).toBe("up");
    });
  });
});
