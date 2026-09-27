import { describe, expect, it } from "vitest";
import { isRegistrationOpen } from "./registration";

describe("isRegistrationOpen", () => {
  it("is open on an empty install so the first user can claim it", () => {
    expect(isRegistrationOpen(0, undefined)).toBe(true);
  });

  it("closes once any user exists", () => {
    expect(isRegistrationOpen(1, undefined)).toBe(false);
    expect(isRegistrationOpen(1, "")).toBe(false);
    expect(isRegistrationOpen(1, "false")).toBe(false);
  });

  it("stays open when the operator sets ALLOW_REGISTRATION=true", () => {
    expect(isRegistrationOpen(3, "true")).toBe(true);
    expect(isRegistrationOpen(3, " TRUE ")).toBe(true);
  });
});
