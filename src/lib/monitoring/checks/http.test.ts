import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { performHttpCheck } from "./http";
import { shutdownRegexWorkerPool } from "../regex-worker-pool";

describe("performHttpCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await shutdownRegexWorkerPool();
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

  describe("assertions (E4)", () => {
    it("passes when a body_contains assertion matches", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response('{"status":"healthy"}', { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [{ type: "body_contains", value: "healthy" }],
      });

      expect(result.status).toBe("up");
      expect(result.errorMessage).toBeNull();
    });

    it("fails the check when a body_contains assertion does not match, and records why", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response('{"status":"degraded"}', { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [{ type: "body_contains", value: "healthy" }],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/Assertion failed/);
      expect(result.errorMessage).toMatch(/healthy/);
    });

    it("fails when a body_not_contains assertion finds the forbidden text", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("500 internal error", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [{ type: "body_not_contains", value: "error" }],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/forbidden text/);
    });

    it("evaluates a body_regex assertion against the response body", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("build 42 succeeded", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [{ type: "body_regex", pattern: "build \\d+ succeeded" }],
      });

      expect(result.status).toBe("up");
    });

    it("passes header_equals when the response header matches", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("ok", {
          status: 200,
          headers: { "X-App-Version": "3.1.0" },
        })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [
          { type: "header_equals", header: "X-App-Version", value: "3.1.0" },
        ],
      });

      expect(result.status).toBe("up");
    });

    it("fails header_equals when the header is missing from the response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("ok", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [
          { type: "header_equals", header: "X-Required", value: "yes" },
        ],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/missing/);
    });

    it("passes json_path_equals against a JSON body", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response('{"data":{"status":"ok"}}', { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [
          { type: "json_path_equals", path: "data.status", value: "ok" },
        ],
      });

      expect(result.status).toBe("up");
    });

    it("fails json_path_equals with a clear message when the body is not valid JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html>not json</html>", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [
          { type: "json_path_equals", path: "data.status", value: "ok" },
        ],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toMatch(/not valid JSON/);
    });

    it("skips assertion evaluation entirely when the status code is already wrong", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response("Not Found", { status: 404 })
      );
      vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy);

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [{ type: "body_contains", value: "healthy" }],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toBe("Expected status 200, got 404");
    });

    it("stops evaluating after the first failing assertion", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("nothing matches either", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [
          { type: "body_contains", value: "first-missing" },
          { type: "body_contains", value: "second-missing" },
        ],
      });

      expect(result.status).toBe("down");
      expect(result.errorMessage).toContain("first-missing");
      expect(result.errorMessage).not.toContain("second-missing");
    });

    it("up when the assertions list is empty (no-op)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("anything", { status: 200 })
      );

      const result = await performHttpCheck({
        target: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        expectedStatusCode: 200,
        assertions: [],
      });

      expect(result.status).toBe("up");
    });
  });
});
