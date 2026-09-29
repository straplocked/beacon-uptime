import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSetVapidDetails = vi.fn();
const mockSendNotification = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import {
  isPushConfigured,
  isGoneStatus,
  sendPushNotification,
  PushSendError,
} from "./push";

const samplePayload = {
  title: "API is down",
  body: "Beacon detected a problem with API.",
  url: "https://beacon.example.com/incidents/inc-1",
};

const sampleSubscription = {
  endpoint: "https://push.example.com/abc123",
  p256dh: "p256dh-key",
  auth: "auth-key",
};

describe("isPushConfigured", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is false when VAPID keys are unset", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(isPushConfigured()).toBe(false);
  });

  it("is false when only one VAPID key is set", () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    delete process.env.VAPID_PRIVATE_KEY;
    expect(isPushConfigured()).toBe(false);
  });

  it("is true when both VAPID keys are set", () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    expect(isPushConfigured()).toBe(true);
  });
});

describe("isGoneStatus", () => {
  it("treats 404 and 410 as gone", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
  });

  it("treats other statuses (and undefined) as not gone", () => {
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(400)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});

describe("sendPushNotification", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "pub-key";
    process.env.VAPID_PRIVATE_KEY = "priv-key";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends the subscription and JSON-stringified payload", async () => {
    mockSendNotification.mockResolvedValue(undefined);

    await sendPushNotification(sampleSubscription, samplePayload);

    expect(mockSendNotification).toHaveBeenCalledWith(
      {
        endpoint: sampleSubscription.endpoint,
        keys: { p256dh: sampleSubscription.p256dh, auth: sampleSubscription.auth },
      },
      JSON.stringify(samplePayload),
    );
  });

  it("wraps send failures in PushSendError with the status code", async () => {
    mockSendNotification.mockRejectedValue(
      Object.assign(new Error("Gone"), { statusCode: 410 }),
    );

    await expect(
      sendPushNotification(sampleSubscription, samplePayload),
    ).rejects.toMatchObject({
      name: "PushSendError",
      statusCode: 410,
    });
  });

  it("PushSendError instances carry isGoneStatus-compatible status codes", async () => {
    mockSendNotification.mockRejectedValue(
      Object.assign(new Error("Not Found"), { statusCode: 404 }),
    );

    try {
      await sendPushNotification(sampleSubscription, samplePayload);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PushSendError);
      expect(isGoneStatus((err as PushSendError).statusCode)).toBe(true);
    }
  });
});
