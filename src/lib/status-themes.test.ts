import { describe, it, expect } from "vitest";

import {
  DEFAULT_BRAND_COLOR,
  getBrandOverrideCSS,
  getThemeCSS,
  STATUS_THEMES,
} from "./status-themes";

describe("getThemeCSS", () => {
  it("emits --sp-* declarations for every theme", () => {
    for (const t of STATUS_THEMES) {
      const css = getThemeCSS(t);
      expect(css).toContain("--sp-bg:");
      expect(css).toContain("--sp-accent:");
    }
  });
});

describe("getBrandOverrideCSS", () => {
  it("returns nothing for the default brand color (theme accent stands)", () => {
    expect(getBrandOverrideCSS(DEFAULT_BRAND_COLOR)).toBe("");
    expect(getBrandOverrideCSS("#14B8A6")).toBe(""); // case-insensitive
  });

  it("returns nothing for null / empty", () => {
    expect(getBrandOverrideCSS(null)).toBe("");
    expect(getBrandOverrideCSS(undefined)).toBe("");
    expect(getBrandOverrideCSS("")).toBe("");
  });

  it("overrides the accent for a real brand color", () => {
    const css = getBrandOverrideCSS("#e5442c");
    expect(css).toContain("--sp-accent:rgb(229,68,44)");
    expect(css).toContain("--sp-accent-subtle:rgba(229,68,44,0.15)");
    expect(css).toContain("--sp-accent-border:rgba(229,68,44,0.30)");
    expect(css).toContain("--sp-bar-up:rgba(229,68,44,0.85)");
  });

  it("parses 3-and-6 char channels correctly", () => {
    expect(getBrandOverrideCSS("#ffffff")).toContain("rgb(255,255,255)");
    expect(getBrandOverrideCSS("#000000")).toContain("rgb(0,0,0)");
    expect(getBrandOverrideCSS("#010203")).toContain("rgb(1,2,3)");
  });

  it("refuses anything that is not a clean #rrggbb — no CSS injection", () => {
    // These must never reach the stylesheet.
    expect(getBrandOverrideCSS("#fff")).toBe(""); // shorthand not accepted here
    expect(getBrandOverrideCSS("red")).toBe("");
    expect(getBrandOverrideCSS("#e5442c;}body{display:none")).toBe("");
    expect(getBrandOverrideCSS("#e5442c }")).toBe("");
    expect(getBrandOverrideCSS("rgb(1,2,3)")).toBe("");
    expect(getBrandOverrideCSS("#gggggg")).toBe("");
    expect(getBrandOverrideCSS("#12345")).toBe("");
    expect(getBrandOverrideCSS("#1234567")).toBe("");
  });

  it("never emits a closing brace or semicolon-escape from input", () => {
    // Even a value that starts hex-like but carries a payload is rejected
    // wholesale, so the output can't break out of the rule.
    const malicious = "#abcdef</style><script>alert(1)</script>";
    expect(getBrandOverrideCSS(malicious)).toBe("");
  });
});
