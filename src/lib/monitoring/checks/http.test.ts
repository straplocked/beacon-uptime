import { describe, it, expect, vi, beforeEach } from "vitest";
import { performHttpCheck } from "./http";

describe("performHttpCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns up when status matches expected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 })
    );

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    });

    expect(result.status).toBe("up");
    expect(result.statusCode).toBe(200);
    expect(result.errorMessage).toBeNull();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns down when status code does not match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    });

    expect(result.status).toBe("down");
    expect(result.statusCode).toBe(404);
    expect(result.errorMessage).toBe("Expected status 200, got 404");
  });

  it("returns down on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND example.com")
    );

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    });

    expect(result.status).toBe("down");
    expect(result.statusCode).toBeNull();
    expect(result.errorMessage).toContain("ENOTFOUND");
  });

  it("returns down on timeout (AbortError)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 5000,
      expectedStatusCode: 200,
    });

    expect(result.status).toBe("down");
    expect(result.statusCode).toBeNull();
    expect(result.errorMessage).toContain("timeout");
    expect(result.errorMessage).toContain("5000");
  });

  it("sends correct User-Agent header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    });

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["User-Agent"]).toBe("Beacon-Monitor/1.0");
  });

  it("merges custom headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
      headers: { Authorization: "Bearer token123" },
    });

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["Authorization"]).toBe("Bearer token123");
    expect(callHeaders["User-Agent"]).toBe("Beacon-Monitor/1.0");
  });

  it("sends body for POST requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await performHttpCheck({
      target: "https://example.com/api",
      method: "POST",
      timeoutMs: 10000,
      expectedStatusCode: 200,
      body: '{"key": "value"}',
    });

    expect(fetchSpy.mock.calls[0][1]?.body).toBe('{"key": "value"}');
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("POST");
  });

  it("does not send body for GET requests even if provided", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
      body: "should-not-be-sent",
    });

    expect(fetchSpy.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("accepts non-200 expected status codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 301 })
    );

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 301,
    });

    expect(result.status).toBe("up");
    expect(result.statusCode).toBe(301);
    expect(result.errorMessage).toBeNull();
  });

  it("handles unknown error types", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("string error");

    const result = await performHttpCheck({
      target: "https://example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    });

    expect(result.status).toBe("down");
    expect(result.errorMessage).toBe("Unknown error");
  });
});
