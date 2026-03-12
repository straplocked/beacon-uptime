import { describe, it, expect, vi, beforeEach } from "vitest";
import { performSslCheck } from "./ssl";
import { EventEmitter } from "events";

vi.mock("tls", () => ({
  connect: vi.fn(),
}));

import * as tls from "tls";

function createMockSocket() {
  const emitter = new EventEmitter();
  const socket = Object.assign(emitter, {
    destroy: vi.fn(),
    getPeerCertificate: vi.fn(),
  });
  return socket;
}

describe("performSslCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up when certificate is valid and not expiring soon", async () => {
    const mockSocket = createMockSocket();
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days out

    vi.mocked(tls.connect).mockImplementation((_opts: any, cb: () => void) => {
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: futureDate.toUTCString(),
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("up");
    expect(result.errorMessage).toBeNull();
    expect(result.tlsExpiry).toBeInstanceOf(Date);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded when certificate expires within 14 days", async () => {
    const mockSocket = createMockSocket();
    const expiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days

    vi.mocked(tls.connect).mockImplementation((_opts: any, cb: () => void) => {
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: expiry.toUTCString(),
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("degraded");
    expect(result.errorMessage).toContain("expires in");
    expect(result.errorMessage).toContain("days");
  });

  it("returns degraded when certificate expires within 7 days", async () => {
    const mockSocket = createMockSocket();
    const expiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days

    vi.mocked(tls.connect).mockImplementation((_opts: any, cb: () => void) => {
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: expiry.toUTCString(),
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("degraded");
    expect(result.errorMessage).toContain("expires in");
  });

  it("returns down when certificate has expired", async () => {
    const mockSocket = createMockSocket();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

    vi.mocked(tls.connect).mockImplementation((_opts: any, cb: () => void) => {
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: pastDate.toUTCString(),
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("expired");
  });

  it("returns down when no certificate is available", async () => {
    const mockSocket = createMockSocket();

    vi.mocked(tls.connect).mockImplementation((_opts: any, cb: () => void) => {
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({});

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("Unable to retrieve certificate");
    expect(result.tlsExpiry).toBeNull();
  });

  it("returns down on connection error", async () => {
    const mockSocket = createMockSocket();

    vi.mocked(tls.connect).mockImplementation(() => {
      setTimeout(() => mockSocket.emit("error", new Error("ECONNREFUSED")), 0);
      return mockSocket as any;
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("ECONNREFUSED");
    expect(result.tlsExpiry).toBeNull();
  });

  it("returns down on timeout", async () => {
    const mockSocket = createMockSocket();

    vi.mocked(tls.connect).mockImplementation(() => {
      setTimeout(() => mockSocket.emit("timeout"), 0);
      return mockSocket as any;
    });

    const result = await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("timeout");
  });

  it("parses custom port from target", async () => {
    const mockSocket = createMockSocket();
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    vi.mocked(tls.connect).mockImplementation((opts: any, cb: () => void) => {
      expect(opts.host).toBe("example.com");
      expect(opts.port).toBe(8443);
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: futureDate.toUTCString(),
    });

    await performSslCheck({
      target: "example.com:8443",
      timeoutMs: 5000,
    });
  });

  it("defaults to port 443", async () => {
    const mockSocket = createMockSocket();
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    vi.mocked(tls.connect).mockImplementation((opts: any, cb: () => void) => {
      expect(opts.port).toBe(443);
      setTimeout(cb, 0);
      return mockSocket as any;
    });

    mockSocket.getPeerCertificate.mockReturnValue({
      valid_to: futureDate.toUTCString(),
    });

    await performSslCheck({
      target: "example.com",
      timeoutMs: 5000,
    });
  });
});
