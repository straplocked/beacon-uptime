import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { performTcpCheck } from "./tcp";
import { EventEmitter } from "events";

vi.mock("net", () => {
  const MockSocket = vi.fn();
  return { Socket: MockSocket };
});

import * as net from "net";

function createMockSocket() {
  const emitter = new EventEmitter();
  const socket = Object.assign(emitter, {
    connect: vi.fn(),
    setTimeout: vi.fn(),
    destroy: vi.fn(),
  });
  return socket;
}

function setupMockSocket(mockSocket: ReturnType<typeof createMockSocket>) {
  vi.mocked(net.Socket).mockImplementation(function (this: any) {
    Object.assign(this, mockSocket);
    // Copy EventEmitter methods
    this.on = mockSocket.on.bind(mockSocket);
    this.emit = mockSocket.emit.bind(mockSocket);
    this.connect = mockSocket.connect;
    this.setTimeout = mockSocket.setTimeout;
    this.destroy = mockSocket.destroy;
    return this;
  } as any);
}

describe("performTcpCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up on successful connection", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
      cb();
      return mockSocket;
    });

    const result = await performTcpCheck({
      target: "example.com:443",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.errorMessage).toBeNull();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it("returns down on connection timeout", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation(() => {
      setTimeout(() => mockSocket.emit("timeout"), 10);
      return mockSocket;
    });

    const result = await performTcpCheck({
      target: "example.com:443",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("timeout");
    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it("returns down on connection error", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation(() => {
      setTimeout(() => mockSocket.emit("error", new Error("ECONNREFUSED")), 10);
      return mockSocket;
    });

    const result = await performTcpCheck({
      target: "example.com:8080",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("ECONNREFUSED");
  });

  it("returns down for invalid target format (no port)", async () => {
    const result = await performTcpCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Invalid target format");
  });

  it("returns down for invalid target format (non-numeric port)", async () => {
    const result = await performTcpCheck({
      target: "example.com:abc",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Invalid target format");
  });

  it("parses host and port correctly", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation((port: number, host: string, cb: () => void) => {
      expect(port).toBe(8080);
      expect(host).toBe("myhost.local");
      cb();
      return mockSocket;
    });

    await performTcpCheck({
      target: "myhost.local:8080",
      timeoutMs: 5000,
    });
  });

  it("handles IPv6 addresses with port", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation((port: number, host: string, cb: () => void) => {
      expect(port).toBe(443);
      expect(host).toBe("::1");
      cb();
      return mockSocket;
    });

    await performTcpCheck({
      target: "::1:443",
      timeoutMs: 5000,
    });
  });

  it("sets socket timeout", async () => {
    const mockSocket = createMockSocket();
    setupMockSocket(mockSocket);

    mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
      cb();
      return mockSocket;
    });

    await performTcpCheck({
      target: "example.com:443",
      timeoutMs: 7500,
    });

    expect(mockSocket.setTimeout).toHaveBeenCalledWith(7500);
  });

  describe("ALLOW_PRIVATE_TARGETS (SSRF guard, Vikunja 804)", () => {
    const original = process.env.ALLOW_PRIVATE_TARGETS;

    afterEach(() => {
      if (original === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
      else process.env.ALLOW_PRIVATE_TARGETS = original;
    });

    it("connects to a private target by default (unset)", async () => {
      delete process.env.ALLOW_PRIVATE_TARGETS;
      const mockSocket = createMockSocket();
      setupMockSocket(mockSocket);
      mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
        cb();
        return mockSocket;
      });

      const result = await performTcpCheck({ target: "192.168.1.1:443", timeoutMs: 5000 });

      expect(result.status).toBe("up");
      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it("blocks a private target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      const mockSocket = createMockSocket();
      setupMockSocket(mockSocket);

      const result = await performTcpCheck({ target: "192.168.1.1:443", timeoutMs: 5000 });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/private or reserved/);
      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it("still connects to a public target when ALLOW_PRIVATE_TARGETS=false", async () => {
      process.env.ALLOW_PRIVATE_TARGETS = "false";
      const mockSocket = createMockSocket();
      setupMockSocket(mockSocket);
      mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
        cb();
        return mockSocket;
      });

      const result = await performTcpCheck({ target: "8.8.8.8:443", timeoutMs: 5000 });

      expect(result.status).toBe("up");
    });
  });
});
