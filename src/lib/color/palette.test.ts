import { describe, it, expect } from "vitest";
import sharp from "sharp";

import { rgbToOklch, parseHex } from "./oklch";
import {
  extractPalette,
  hueDistance,
  scoreCluster,
  suggestTheme,
} from "./palette";

/* ─── Fixtures ──────────────────────────────────────────────── */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A `size`×`size` PNG: solid `bg`, with a centered square of `fg`. */
async function glyphOnBackground(
  fg: Rgb,
  bg: Rgb,
  size = 64,
  glyph = 32,
): Promise<Buffer> {
  const square = await sharp({
    create: {
      width: glyph,
      height: glyph,
      channels: 4,
      background: { ...fg, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...bg, alpha: 1 },
    },
  })
    .composite([
      {
        input: square,
        top: (size - glyph) >> 1,
        left: (size - glyph) >> 1,
      },
    ])
    .png()
    .toBuffer();
}

async function solid(color: Rgb, size = 32): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

const RED = { r: 225, g: 29, b: 72 };
const GREEN = { r: 22, g: 197, b: 94 };
const CYAN = { r: 6, g: 182, b: 212 };
const BLUE = { r: 29, g: 78, b: 216 };
const VIOLET = { r: 124, g: 58, b: 237 };
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

/* ─── Pure helpers ──────────────────────────────────────────── */

describe("hueDistance", () => {
  it("measures the short way around the circle", () => {
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });

  it("never exceeds 180", () => {
    for (let a = 0; a < 360; a += 37) {
      for (let b = 0; b < 360; b += 53) {
        expect(hueDistance(a, b)).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("scoreCluster", () => {
  it("ranks a small saturated glyph above a large white background", () => {
    const white = scoreCluster(rgbToOklch(WHITE), 0.75);
    const red = scoreCluster(rgbToOklch(RED), 0.25);
    expect(red).toBeGreaterThan(white);
  });

  it("ranks a small saturated glyph above a large black background", () => {
    const black = scoreCluster(rgbToOklch(BLACK), 0.8);
    const cyan = scoreCluster(rgbToOklch(CYAN), 0.2);
    expect(cyan).toBeGreaterThan(black);
  });

  it("prefers the more prominent of two equally saturated colors", () => {
    const lch = rgbToOklch(RED);
    expect(scoreCluster(lch, 0.5)).toBeGreaterThan(scoreCluster(lch, 0.1));
  });

  it("penalizes near-black and near-white at equal population", () => {
    const mid = scoreCluster(rgbToOklch(RED), 0.3);
    expect(scoreCluster(rgbToOklch(WHITE), 0.3)).toBeLessThan(mid);
    expect(scoreCluster(rgbToOklch(BLACK), 0.3)).toBeLessThan(mid);
  });
});

describe("suggestTheme", () => {
  it("maps warm hues to ember", () => {
    expect(suggestTheme(rgbToOklch(RED))).toBe("ember");
    expect(suggestTheme(rgbToOklch({ r: 249, g: 115, b: 22 }))).toBe("ember");
  });

  it("maps green to terminal", () => {
    expect(suggestTheme(rgbToOklch(GREEN))).toBe("terminal");
  });

  it("maps cyan/teal to midnight", () => {
    expect(suggestTheme(rgbToOklch(CYAN))).toBe("midnight");
  });

  it("maps blue to clean", () => {
    expect(suggestTheme(rgbToOklch(BLUE))).toBe("clean");
  });

  it("maps violet to aurora", () => {
    expect(suggestTheme(rgbToOklch(VIOLET))).toBe("aurora");
  });

  it("falls back to clean for monochrome input", () => {
    expect(suggestTheme(rgbToOklch({ r: 128, g: 128, b: 128 }))).toBe("clean");
    expect(suggestTheme({ L: 0.5, C: 0.001, h: 200 })).toBe("clean");
  });
});

/* ─── Full pipeline ─────────────────────────────────────────── */

describe("extractPalette", () => {
  it("finds a saturated glyph on a white background", async () => {
    const palette = await extractPalette(await glyphOnBackground(RED, WHITE));

    const brand = parseHex(palette.rawBrandColor);
    expect(brand).not.toBeNull();
    const lch = rgbToOklch(brand!);
    // Should land on the red glyph, not the dominant white field.
    expect(lch.C).toBeGreaterThan(0.1);
    expect(hueDistance(lch.h, rgbToOklch(RED).h)).toBeLessThan(25);
    expect(palette.confidence).toBe("high");
    expect(palette.suggestedTheme).toBe("ember");
  });

  it("finds a saturated glyph on a dark background", async () => {
    const palette = await extractPalette(
      await glyphOnBackground(CYAN, { r: 17, g: 24, b: 39 }),
    );
    const brand = parseHex(palette.rawBrandColor)!;
    const lch = rgbToOklch(brand);
    expect(lch.C).toBeGreaterThan(0.08);
    expect(hueDistance(lch.h, rgbToOklch(CYAN).h)).toBeLessThan(30);
    expect(palette.suggestedTheme).toBe("midnight");
  });

  it("labels exactly one swatch as brand and returns populations summing to ~1", async () => {
    const palette = await extractPalette(await glyphOnBackground(GREEN, WHITE));
    const brands = palette.swatches.filter((s) => s.role === "brand");
    expect(brands).toHaveLength(1);
    expect(brands[0].hex).toBe(palette.rawBrandColor);

    const total = palette.swatches.reduce((s, x) => s + x.population, 0);
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
  });

  it("marks a near-monochrome image as low confidence and suggests clean", async () => {
    const palette = await extractPalette(await glyphOnBackground(BLACK, WHITE));
    expect(palette.confidence).toBe("low");
    expect(palette.suggestedTheme).toBe("clean");
    expect(palette.notes.join(" ")).toMatch(/monochrome/i);
  });

  it("is deterministic across repeated runs on the same image", async () => {
    const img = await glyphOnBackground(VIOLET, WHITE);
    const a = await extractPalette(img);
    const b = await extractPalette(img);
    expect(a.brandColor).toBe(b.brandColor);
    expect(a.suggestedTheme).toBe(b.suggestedTheme);
    expect(a.swatches.map((s) => s.hex)).toEqual(b.swatches.map((s) => s.hex));
  });

  it("guarantees the brand color is legible on the suggested theme", async () => {
    // Deep blue on white suggests `clean` (a light theme), so the brand
    // must stay dark enough to read.
    for (const color of [BLUE, RED, GREEN, CYAN, VIOLET]) {
      const palette = await extractPalette(
        await glyphOnBackground(color, WHITE),
      );
      expect(palette.brandContrast).toBeGreaterThanOrEqual(4.4);
    }
  });

  it("handles a solid single-color image", async () => {
    const palette = await extractPalette(await solid(CYAN));
    const lch = rgbToOklch(parseHex(palette.rawBrandColor)!);
    expect(hueDistance(lch.h, rgbToOklch(CYAN).h)).toBeLessThan(20);
    expect(palette.swatches.length).toBeGreaterThanOrEqual(1);
    expect(palette.analyzedPixels).toBeGreaterThan(0);
  });

  it("ignores transparent pixels rather than sampling them as black", async () => {
    const glyph = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { ...RED, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const transparentBg = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: glyph, top: 24, left: 24 }])
      .png()
      .toBuffer();

    const palette = await extractPalette(transparentBg);
    const lch = rgbToOklch(parseHex(palette.rawBrandColor)!);
    expect(hueDistance(lch.h, rgbToOklch(RED).h)).toBeLessThan(25);
    // Only the 16×16 glyph should have been sampled, not the full 64×64.
    expect(palette.analyzedPixels).toBeLessThan(64 * 64 * 0.5);
  });

  it("throws a helpful error for a fully transparent image", async () => {
    const empty = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    await expect(extractPalette(empty)).rejects.toThrow(/transparent/i);
  });

  it("reads an ICO wrapping a BMP DIB", async () => {
    // Hand-built 32bpp ICO, solid green — exercises the non-sharp path.
    const w = 16;
    const h = 16;
    const rowSize = w * 4;
    const maskRowSize = Math.ceil(w / 32) * 4;
    const dib = Buffer.alloc(40 + rowSize * h + maskRowSize * h);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(w, 4);
    dib.writeInt32LE(h * 2, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    for (let i = 0; i < w * h; i++) {
      const off = 40 + i * 4;
      dib[off] = GREEN.b;
      dib[off + 1] = GREEN.g;
      dib[off + 2] = GREEN.r;
      dib[off + 3] = 255;
    }
    const ico = Buffer.alloc(6 + 16 + dib.length);
    ico.writeUInt16LE(0, 0);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(1, 4);
    ico.writeUInt8(w, 6);
    ico.writeUInt8(h, 7);
    ico.writeUInt16LE(1, 10);
    ico.writeUInt16LE(32, 12);
    ico.writeUInt32LE(dib.length, 14);
    ico.writeUInt32LE(22, 18);
    dib.copy(ico, 22);

    const palette = await extractPalette(ico);
    const lch = rgbToOklch(parseHex(palette.rawBrandColor)!);
    expect(hueDistance(lch.h, rgbToOklch(GREEN).h)).toBeLessThan(25);
    expect(palette.suggestedTheme).toBe("terminal");
  });
});
