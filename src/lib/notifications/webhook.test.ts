import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendWebhookNotification } from "./webhook";

const samplePayload = {
  event: "monitor.down",
  monitor: {
    id: "mon-123",
    name: "Production API",
    target: "https://api.example.com",
    type: "http",
  },
  check: {
    status: "down",
    statusCode: 500,
    responseTimeMs: 2500,
    error: "Internal Server Error",
    checkedAt: "2026-03-12T00:00:00.000Z",
    region: "us-east",
  },
  previousStatus: "up",
};

describe("sendWebhookNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST request to webhook URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await sendWebhookNotification(
      { webhook_url: "https://hooks.example.com/beacon" },
      samplePayload
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/beacon");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(samplePayload);
  });

  it("includes correct headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await sendWebhookNotification(
      { webhook_url: "https://hooks.example.com" },
      samplePayload
    );

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("Beacon-Webhook/1.0");
  });

  it("adds HMAC signature when secret is provided", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await sendWebhookNotification(
      { webhook_url: "https://hooks.example.com", secret: "my-webhook-secret" },
      samplePayload
    );

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Beacon-Signature"]).toBeDefined();
    expect(headers["X-Beacon-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("does not include signature header when no secret", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("OK", { status: 200 }));

    await sendWebhookNotification(
      { webhook_url: "https://hooks.example.com" },
      samplePayload
    );

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Beacon-Signature"]).toBeUndefined();
  });

  it("produces consistent HMAC for same payload and secret", async () => {
    const signatures: string[] = [];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 })
    );

    for (let i = 0; i < 2; i++) {
      await sendWebhookNotification(
        { webhook_url: "https://hooks.example.com", secret: "test-secret" },
        samplePayload
      );
    }

    const calls = vi.mocked(fetch).mock.calls;
    for (const call of calls) {
      const headers = call[1]?.headers as Record<string, string>;
      signatures.push(headers["X-Beacon-Signature"]);
    }

    expect(signatures[0]).toBe(signatures[1]);
  });

  it("throws when webhook URL is not configured", async () => {
    await expect(
      sendWebhookNotification({}, samplePayload)
    ).rejects.toThrow("Webhook URL not configured");
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Request", { status: 400 })
    );

    await expect(
      sendWebhookNotification(
        { webhook_url: "https://hooks.example.com" },
        samplePayload
      )
    ).rejects.toThrow("Webhook error (400)");
  });

  it("throws on 500 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 })
    );

    await expect(
      sendWebhookNotification(
        { webhook_url: "https://hooks.example.com" },
        samplePayload
      )
    ).rejects.toThrow("Webhook error (500)");
  });
});
