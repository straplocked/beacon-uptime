import { describe, it, expect } from "vitest";

import {
  contrastRatio,
  ensureContrast,
  formatOklch,
  oklabToRgb,
  oklchToRgb,
  parseHex,
  relativeLuminance,
  rgbToOklab,
  rgbToOklch,
  toHex,
} from "./oklch";

describe("rgbToOklab", () => {
  it("maps white to L=1 with no chroma", () => {
    const lab = rgbToOklab({ r: 255, g: 255, b: 255 });
    expect(lab.L).toBeCloseTo(1, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it("maps black to L=0", () => {
    const lab = rgbToOklab({ r: 0, g: 0, b: 0 });
    expect(lab.L).toBeCloseTo(0, 5);
  });

  it("puts mid gray near L=0.6 with no chroma", () => {
    const lab = rgbToOklab({ r: 128, g: 128, b: 128 });
    expect(lab.L).toBeGreaterThan(0.55);
    expect(lab.L).toBeLessThan(0.65);
    expect(Math.hypot(lab.a, lab.b)).toBeLessThan(0.001);
  });
});

describe("round-trip", () => {
  const samples = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 225, g: 29, b: 72 },
    { r: 45, g: 212, b: 191 },
    { r: 37, g: 99, b: 235 },
    { r: 245, g: 158, b: 11 },
    { r: 17, g: 24, b: 39 },
  ];

  it("survives rgb → oklab → rgb within 1/255", () => {
    for (const rgb of samples) {
      const back = oklabToRgb(rgbToOklab(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it("survives rgb → oklch → rgb within 1/255", () => {
    for (const rgb of samples) {
      const back = oklchToRgb(rgbToOklch(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });
});

describe("rgbToOklch", () => {
  it("reports hue in 0–360", () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ]) {
      const lch = rgbToOklch(rgb);
      expect(lch.h).toBeGreaterThanOrEqual(0);
      expect(lch.h).toBeLessThan(360);
    }
  });

  it("zeroes hue for achromatic colors instead of emitting atan2 noise", () => {
    expect(rgbToOklch({ r: 128, g: 128, b: 128 }).h).toBe(0);
    expect(rgbToOklch({ r: 255, g: 255, b: 255 }).h).toBe(0);
  });

  it("separates distinct hues by a meaningful angle", () => {
    const red = rgbToOklch({ r: 225, g: 29, b: 72 });
    const green = rgbToOklch({ r: 22, g: 197, b: 94 });
    expect(Math.abs(red.h - green.h)).toBeGreaterThan(90);
  });
});

describe("parseHex / toHex", () => {
  it("parses 6-digit hex", () => {
    expect(parseHex("#14b8a6")).toEqual({ r: 20, g: 184, b: 166 });
  });

  it("parses without a leading hash", () => {
    expect(parseHex("14b8a6")).toEqual({ r: 20, g: 184, b: 166 });
  });

  it("expands 3-digit shorthand", () => {
    expect(parseHex("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
  });

  it("ignores the alpha byte on 8-digit hex", () => {
    expect(parseHex("#14b8a680")).toEqual({ r: 20, g: 184, b: 166 });
  });

  it("rejects malformed input", () => {
    expect(parseHex("#zzzzzz")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("formats back to lowercase 6-digit hex", () => {
    expect(toHex({ r: 20, g: 184, b: 166 })).toBe("#14b8a6");
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("clamps out-of-range channels", () => {
    expect(toHex({ r: 300, g: -20, b: 128 })).toBe("#ff0080");
  });
});

describe("formatOklch", () => {
  it("emits a CSS oklch() string", () => {
    const s = formatOklch({ L: 0.55, C: 0.15, h: 195 });
    expect(s).toBe("oklch(0.550 0.150 195.0)");
  });
});

describe("contrast", () => {
  it("gives white a relative luminance of 1 and black 0", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it("returns 21:1 for black on white", () => {
    expect(
      contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }),
    ).toBeCloseTo(21, 2);
  });

  it("returns 1:1 for identical colors", () => {
    expect(
      contrastRatio({ r: 18, g: 52, b: 86 }, { r: 18, g: 52, b: 86 }),
    ).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    const a = { r: 20, g: 184, b: 166 };
    const b = { r: 26, g: 26, b: 46 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("ensureContrast", () => {
  const darkBg = { r: 26, g: 26, b: 46 }; // midnight theme background

  it("leaves an already-passing color untouched", () => {
    const bright = { r: 45, g: 212, b: 191 };
    const out = ensureContrast(bright, darkBg, 4.5);
    expect(out.adjusted).toBe(false);
    expect(out.rgb).toEqual(bright);
    expect(out.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens a too-dark color against a dark background", () => {
    const tooDark = { r: 20, g: 40, b: 60 };
    const out = ensureContrast(tooDark, darkBg, 4.5);
    expect(out.adjusted).toBe(true);
    expect(out.ratio).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(out.rgb)).toBeGreaterThan(
      relativeLuminance(tooDark),
    );
  });

  it("darkens a too-light color against a light background", () => {
    const lightBg = { r: 248, g: 250, b: 252 }; // clean theme background
    const tooLight = { r: 250, g: 240, b: 200 };
    const out = ensureContrast(tooLight, lightBg, 4.5);
    expect(out.adjusted).toBe(true);
    expect(out.ratio).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(out.rgb)).toBeLessThan(
      relativeLuminance(tooLight),
    );
  });

  it("roughly preserves hue while correcting lightness", () => {
    const tooDark = { r: 60, g: 20, b: 20 };
    const out = ensureContrast(tooDark, darkBg, 4.5);
    const before = rgbToOklch(tooDark);
    const after = rgbToOklch(out.rgb);
    const delta = Math.abs(before.h - after.h);
    expect(Math.min(delta, 360 - delta)).toBeLessThan(15);
  });

  it("returns the best achievable color when the target is unreachable", () => {
    // Mid-gray background: no lightness can reach 21:1.
    const midBg = { r: 119, g: 119, b: 119 };
    const out = ensureContrast({ r: 120, g: 120, b: 120 }, midBg, 21);
    expect(out.ratio).toBeLessThan(21);
    expect(out.ratio).toBeGreaterThan(1);
  });
});
