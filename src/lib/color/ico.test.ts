import { describe, it, expect } from "vitest";
import sharp from "sharp";

import {
  decodeIcoBmp,
  extractFromIco,
  isIco,
  listIcoEntries,
  pickBestEntry,
} from "./ico";

/* ─── Fixture builders ──────────────────────────────────────── */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Build a single-entry ICO wrapping a 32bpp BMP DIB.
 * Mirrors what classic favicon tooling emits.
 */
function buildBmpIco(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => Rgb & { a?: number },
  bitCount: 32 | 24 = 32,
): Buffer {
  const bytesPerPixel = bitCount / 8;
  const rowSize = Math.ceil((width * bitCount) / 32) * 4;
  const maskRowSize = Math.ceil(width / 32) * 4;
  const pixelBytes = rowSize * height;
  const maskBytes = maskRowSize * height;

  const dib = Buffer.alloc(40 + pixelBytes + maskBytes);
  dib.writeUInt32LE(40, 0); // biSize
  dib.writeInt32LE(width, 4); // biWidth
  dib.writeInt32LE(height * 2, 8); // biHeight — doubled: color rows + AND mask
  dib.writeUInt16LE(1, 12); // biPlanes
  dib.writeUInt16LE(bitCount, 14); // biBitCount
  dib.writeUInt32LE(0, 16); // biCompression = BI_RGB

  for (let y = 0; y < height; y++) {
    // Bottom-up storage.
    const srcY = height - 1 - y;
    const rowStart = 40 + srcY * rowSize;
    for (let x = 0; x < width; x++) {
      const p = pixelAt(x, y);
      const off = rowStart + x * bytesPerPixel;
      dib[off] = p.b;
      dib[off + 1] = p.g;
      dib[off + 2] = p.r;
      if (bitCount === 32) dib[off + 3] = p.a ?? 255;
    }
  }
  // AND mask left all-zero → fully opaque.

  const ico = Buffer.alloc(6 + 16 + dib.length);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type = icon
  ico.writeUInt16LE(1, 4); // count
  ico.writeUInt8(width === 256 ? 0 : width, 6);
  ico.writeUInt8(height === 256 ? 0 : height, 7);
  ico.writeUInt8(0, 8); // colorCount
  ico.writeUInt8(0, 9); // reserved
  ico.writeUInt16LE(1, 10); // planes
  ico.writeUInt16LE(bitCount, 12);
  ico.writeUInt32LE(dib.length, 14); // bytesInRes
  ico.writeUInt32LE(22, 18); // imageOffset
  dib.copy(ico, 22);
  return ico;
}

/** Build a single-entry ICO wrapping a complete PNG. */
function buildPngIco(width: number, height: number, png: Buffer): Buffer {
  const ico = Buffer.alloc(6 + 16 + png.length);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt8(width === 256 ? 0 : width, 6);
  ico.writeUInt8(height === 256 ? 0 : height, 7);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  png.copy(ico, 22);
  return ico;
}

/** Build a multi-entry ICO directory (entries reference real PNG payloads). */
function buildMultiEntryIco(
  entries: { width: number; height: number; bitCount: number; payload: Buffer }[],
): Buffer {
  const dirSize = 6 + entries.length * 16;
  const total = dirSize + entries.reduce((s, e) => s + e.payload.length, 0);
  const ico = Buffer.alloc(total);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(entries.length, 4);

  let offset = dirSize;
  entries.forEach((e, i) => {
    const base = 6 + i * 16;
    ico.writeUInt8(e.width === 256 ? 0 : e.width, base);
    ico.writeUInt8(e.height === 256 ? 0 : e.height, base + 1);
    ico.writeUInt16LE(1, base + 4);
    ico.writeUInt16LE(e.bitCount, base + 6);
    ico.writeUInt32LE(e.payload.length, base + 8);
    ico.writeUInt32LE(offset, base + 12);
    e.payload.copy(ico, offset);
    offset += e.payload.length;
  });
  return ico;
}

/* ─── Tests ─────────────────────────────────────────────────── */

describe("isIco", () => {
  it("recognizes a real ICO header", () => {
    const ico = buildBmpIco(16, 16, () => ({ r: 255, g: 0, b: 0 }));
    expect(isIco(ico)).toBe(true);
  });

  it("rejects a PNG", async () => {
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 1, g: 2, b: 3, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    expect(isIco(png)).toBe(false);
  });

  it("rejects a cursor (type 2), which is not a favicon", () => {
    const ico = buildBmpIco(16, 16, () => ({ r: 255, g: 0, b: 0 }));
    ico.writeUInt16LE(2, 2);
    expect(isIco(ico)).toBe(false);
  });

  it("rejects short buffers", () => {
    expect(isIco(Buffer.alloc(3))).toBe(false);
  });
});

describe("listIcoEntries", () => {
  it("reads the directory", () => {
    const ico = buildBmpIco(32, 32, () => ({ r: 10, g: 20, b: 30 }));
    const entries = listIcoEntries(ico);
    expect(entries).toHaveLength(1);
    expect(entries[0].width).toBe(32);
    expect(entries[0].height).toBe(32);
    expect(entries[0].bitCount).toBe(32);
  });

  it("treats a stored dimension of 0 as 256", () => {
    const ico = buildBmpIco(16, 16, () => ({ r: 0, g: 0, b: 0 }));
    ico.writeUInt8(0, 6);
    ico.writeUInt8(0, 7);
    expect(listIcoEntries(ico)[0].width).toBe(256);
    expect(listIcoEntries(ico)[0].height).toBe(256);
  });

  it("throws on a non-ICO buffer", () => {
    expect(() => listIcoEntries(Buffer.alloc(32))).toThrow(/Not an ICO/);
  });

  it("skips entries whose payload runs past the buffer", () => {
    const ico = buildBmpIco(16, 16, () => ({ r: 0, g: 0, b: 0 }));
    ico.writeUInt32LE(0xffffff, 14); // absurd bytesInRes
    expect(() => listIcoEntries(ico)).toThrow(/no usable entries/);
  });
});

describe("pickBestEntry", () => {
  it("picks the largest by area", () => {
    const best = pickBestEntry([
      { width: 16, height: 16, bitCount: 32, byteLength: 1, offset: 0 },
      { width: 64, height: 64, bitCount: 8, byteLength: 1, offset: 0 },
      { width: 32, height: 32, bitCount: 32, byteLength: 1, offset: 0 },
    ]);
    expect(best.width).toBe(64);
  });

  it("breaks ties on color depth", () => {
    const best = pickBestEntry([
      { width: 32, height: 32, bitCount: 8, byteLength: 1, offset: 0 },
      { width: 32, height: 32, bitCount: 32, byteLength: 1, offset: 0 },
    ]);
    expect(best.bitCount).toBe(32);
  });
});

describe("decodeIcoBmp", () => {
  it("decodes a solid 32bpp icon with correct channel order", () => {
    const color = { r: 225, g: 29, b: 72 };
    const ico = buildBmpIco(8, 8, () => color);
    const result = extractFromIco(ico);
    expect(result.kind).toBe("raw");
    if (result.kind !== "raw") return;

    const { image } = result;
    expect(image.width).toBe(8);
    expect(image.height).toBe(8);
    expect(image.data.length).toBe(8 * 8 * 4);
    // BMP stores BGRA; we must emit RGBA.
    expect(image.data[0]).toBe(color.r);
    expect(image.data[1]).toBe(color.g);
    expect(image.data[2]).toBe(color.b);
    expect(image.data[3]).toBe(255);
  });

  it("un-flips bottom-up row order", () => {
    // Top half red, bottom half blue as the image is meant to be seen.
    const ico = buildBmpIco(4, 4, (_x, y) =>
      y < 2 ? { r: 255, g: 0, b: 0 } : { r: 0, g: 0, b: 255 },
    );
    const result = extractFromIco(ico);
    if (result.kind !== "raw") throw new Error("expected raw");
    const { data, width } = result.image;

    const topPixel = 0;
    const bottomPixel = (3 * width + 0) * 4;
    expect(data[topPixel]).toBe(255); // red on top
    expect(data[topPixel + 2]).toBe(0);
    expect(data[bottomPixel]).toBe(0); // blue on bottom
    expect(data[bottomPixel + 2]).toBe(255);
  });

  it("decodes 24bpp entries using the AND mask for alpha", () => {
    const ico = buildBmpIco(8, 8, () => ({ r: 10, g: 200, b: 30 }), 24);
    const result = extractFromIco(ico);
    if (result.kind !== "raw") throw new Error("expected raw");
    expect(result.image.data[0]).toBe(10);
    expect(result.image.data[1]).toBe(200);
    expect(result.image.data[2]).toBe(30);
    expect(result.image.data[3]).toBe(255); // zeroed mask → opaque
  });

  it("rejects compressed DIBs", () => {
    const ico = buildBmpIco(8, 8, () => ({ r: 0, g: 0, b: 0 }));
    ico.writeUInt32LE(3, 22 + 16); // biCompression = BI_BITFIELDS
    expect(() => extractFromIco(ico)).toThrow(/compression/);
  });

  it("rejects an unsupported bit depth", () => {
    const entry = { width: 8, height: 8, bitCount: 4, byteLength: 0, offset: 0 };
    const dib = Buffer.alloc(40 + 256);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(8, 4);
    dib.writeInt32LE(16, 8);
    dib.writeUInt16LE(4, 14);
    expect(() => decodeIcoBmp(dib, entry)).toThrow(/bit depth/);
  });

  it("rejects a truncated header", () => {
    const entry = { width: 8, height: 8, bitCount: 32, byteLength: 0, offset: 0 };
    expect(() => decodeIcoBmp(Buffer.alloc(10), entry)).toThrow(/truncated/);
  });
});

describe("extractFromIco with embedded PNG", () => {
  it("returns the PNG untouched for sharp to decode", async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 45, g: 212, b: 191, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const ico = buildPngIco(32, 32, png);

    const result = extractFromIco(ico);
    expect(result.kind).toBe("png");
    if (result.kind !== "png") return;
    expect(result.png.equals(png)).toBe(true);

    // And sharp really can read it back.
    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(32);
    expect(meta.format).toBe("png");
  });

  it("selects the largest entry from a multi-size ICO", async () => {
    const small = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const large = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const ico = buildMultiEntryIco([
      { width: 16, height: 16, bitCount: 32, payload: small },
      { width: 64, height: 64, bitCount: 32, payload: large },
    ]);

    const result = extractFromIco(ico);
    if (result.kind !== "png") throw new Error("expected png");
    expect(result.entry.width).toBe(64);
    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(64);
  });
});
