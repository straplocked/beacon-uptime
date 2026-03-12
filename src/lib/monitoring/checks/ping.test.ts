import { describe, it, expect, vi, beforeEach } from "vitest";
import { performPingCheck } from "./ping";

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

import { exec } from "child_process";

describe("performPingCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up on successful ping", async () => {
    vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(
        null,
        "PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.\n64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=4.25 ms\n",
        ""
      );
      return {} as any;
    });

    const result = await performPingCheck({
      target: "1.1.1.1",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBe(4);
    expect(result.errorMessage).toBeNull();
  });

  it("extracts response time from ping output", async () => {
    vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(
        null,
        "64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=12.8 ms",
        ""
      );
      return {} as any;
    });

    const result = await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBe(13); // Math.round(12.8)
  });

  it("handles time<1 ms format", async () => {
    vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(
        null,
        "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time<1 ms",
        ""
      );
      return {} as any;
    });

    const result = await performPingCheck({
      target: "127.0.0.1",
      timeoutMs: 5000,
    });

    // time<1 won't match the regex time=X, so falls back to elapsed time
    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns down on ping failure", async () => {
    vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(new Error("Command failed"), "", "ping: bad-host: Name or service not known");
      return {} as any;
    });

    const result = await performPingCheck({
      target: "bad-host",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Name or service not known");
  });

  it("returns down with error message when stderr is empty", async () => {
    vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(new Error("Command failed: exit code 1"), "", "");
      return {} as any;
    });

    const result = await performPingCheck({
      target: "unreachable.host",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Command failed");
  });

  it("constructs correct ping command with timeout", async () => {
    vi.mocked(exec).mockImplementation((cmd: any, _opts: any, cb: any) => {
      expect(cmd).toBe("ping -c 1 -W 5 8.8.8.8");
      cb(null, "64 bytes from 8.8.8.8: time=10.0 ms", "");
      return {} as any;
    });

    await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 5000,
    });
  });

  it("rounds timeout up to nearest second", async () => {
    vi.mocked(exec).mockImplementation((cmd: any, _opts: any, cb: any) => {
      expect(cmd).toBe("ping -c 1 -W 3 8.8.8.8");
      cb(null, "64 bytes from 8.8.8.8: time=10.0 ms", "");
      return {} as any;
    });

    await performPingCheck({
      target: "8.8.8.8",
      timeoutMs: 2500,
    });
  });
});
