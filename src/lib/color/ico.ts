/**
 * Minimal ICO container decoder.
 *
 * `sharp` handles PNG/JPEG/WebP/GIF/AVIF/SVG but NOT ICO — and most real
 * favicons are still served as `/favicon.ico`. Without this, the auto-brand
 * feature would fail on the majority of sites it's pointed at.
 *
 * ICO is a thin container: a directory of entries, each holding either a
 * complete PNG (how modern favicon generators emit it) or a headerless BMP
 * DIB (the classic form). We pick the largest entry and either hand the PNG
 * straight to sharp or decode the DIB ourselves.
 *
 * Format reference: https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface IcoEntry {
  width: number;
  height: number;
  bitCount: number;
  byteLength: number;
  offset: number;
}

/** Raw RGBA bitmap, top-down, 4 bytes per pixel. */
export interface RawImage {
  width: number;
  height: number;
  /** length === width * height * 4 */
  data: Buffer;
}

export function isIco(buf: Buffer): boolean {
  // reserved === 0 && type === 1 (icon). Cursors (type 2) share the layout
  // but aren't favicons, so we don't claim them.
  return (
    buf.length >= 6 &&
    buf.readUInt16LE(0) === 0 &&
    buf.readUInt16LE(2) === 1 &&
    buf.readUInt16LE(4) > 0
  );
}

export function listIcoEntries(buf: Buffer): IcoEntry[] {
  if (!isIco(buf)) throw new Error("Not an ICO file");
  const count = buf.readUInt16LE(4);
  const entries: IcoEntry[] = [];

  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    if (base + 16 > buf.length) break;
    // A stored dimension of 0 means 256 — the field is a single byte.
    const width = buf.readUInt8(base) || 256;
    const height = buf.readUInt8(base + 1) || 256;
    const bitCount = buf.readUInt16LE(base + 6);
    const byteLength = buf.readUInt32LE(base + 8);
    const offset = buf.readUInt32LE(base + 12);
    if (offset + byteLength > buf.length) continue; // truncated / malformed
    entries.push({ width, height, bitCount, byteLength, offset });
  }

  if (entries.length === 0) throw new Error("ICO contains no usable entries");
  return entries;
}

/** Largest entry by pixel area, tie-broken by color depth. */
export function pickBestEntry(entries: IcoEntry[]): IcoEntry {
  return entries.reduce((best, e) => {
    const a = e.width * e.height;
    const b = best.width * best.height;
    if (a !== b) return a > b ? e : best;
    return e.bitCount > best.bitCount ? e : best;
  });
}

export interface IcoExtraction {
  kind: "png";
  /** Complete PNG file — hand directly to sharp. */
  png: Buffer;
  entry: IcoEntry;
}

export interface IcoRawExtraction {
  kind: "raw";
  image: RawImage;
  entry: IcoEntry;
}

/**
 * Pull the best image out of an ICO.
 *
 * Returns either an embedded PNG (caller passes it to sharp) or an already
 * decoded RGBA bitmap for the BMP case.
 */
export function extractFromIco(buf: Buffer): IcoExtraction | IcoRawExtraction {
  const entry = pickBestEntry(listIcoEntries(buf));
  const slice = buf.subarray(entry.offset, entry.offset + entry.byteLength);

  if (slice.length >= 8 && slice.subarray(0, 8).equals(PNG_MAGIC)) {
    return { kind: "png", png: slice, entry };
  }

  return { kind: "raw", image: decodeIcoBmp(slice, entry), entry };
}

/**
 * Decode a headerless BMP DIB as stored inside an ICO entry.
 *
 * Differences from a standalone .bmp worth knowing:
 *   - There is no BITMAPFILEHEADER; the data starts at BITMAPINFOHEADER.
 *   - `biHeight` is DOUBLE the real height, because it counts the XOR (color)
 *     rows plus the AND (1-bit transparency mask) rows.
 *   - Rows are stored bottom-up and padded to 4-byte boundaries.
 *
 * Supports 32bpp (BGRA), 24bpp (BGR + AND mask), and 8bpp (palette + AND
 * mask), which together cover essentially every favicon in the wild.
 */
export function decodeIcoBmp(dib: Buffer, entry: IcoEntry): RawImage {
  if (dib.length < 40) throw new Error("ICO BMP header truncated");

  const headerSize = dib.readUInt32LE(0);
  const width = dib.readInt32LE(4);
  const storedHeight = dib.readInt32LE(8);
  const bitCount = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);

  if (compression !== 0) {
    throw new Error(`Unsupported ICO BMP compression: ${compression}`);
  }
  // biHeight includes the AND mask, so the real image is half as tall.
  const height = Math.floor(storedHeight / 2) || entry.height;
  if (width <= 0 || height <= 0 || width > 1024 || height > 1024) {
    throw new Error(`Unreasonable ICO BMP dimensions: ${width}x${height}`);
  }

  // Palette follows the header for indexed formats.
  let paletteSize = 0;
  if (bitCount <= 8) {
    const declared = dib.readUInt32LE(32); // biClrUsed
    paletteSize = declared || 1 << bitCount;
  }
  const paletteOffset = headerSize;
  const pixelOffset = paletteOffset + paletteSize * 4;

  const rowSize = Math.ceil((width * bitCount) / 32) * 4;
  const maskRowSize = Math.ceil(width / 32) * 4;
  const maskOffset = pixelOffset + rowSize * height;

  const out = Buffer.alloc(width * height * 4);

  const readMask = (x: number, srcY: number): number => {
    const bitIndex = maskOffset + srcY * maskRowSize + (x >> 3);
    if (bitIndex >= dib.length) return 0; // no mask present → opaque
    const bit = (dib.readUInt8(bitIndex) >> (7 - (x & 7))) & 1;
    return bit ? 0 : 255; // AND mask: 1 means transparent
  };

  for (let y = 0; y < height; y++) {
    // Bottom-up storage: source row 0 is the visual bottom row.
    const srcY = height - 1 - y;
    const rowStart = pixelOffset + srcY * rowSize;

    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (bitCount === 32) {
        const si = rowStart + x * 4;
        if (si + 3 >= dib.length) continue;
        b = dib[si];
        g = dib[si + 1];
        r = dib[si + 2];
        a = dib[si + 3];
        // Some encoders leave the alpha byte zeroed across the whole image
        // and rely on the AND mask instead; fall back when that happens.
        if (a === 0) a = readMask(x, srcY);
      } else if (bitCount === 24) {
        const si = rowStart + x * 3;
        if (si + 2 >= dib.length) continue;
        b = dib[si];
        g = dib[si + 1];
        r = dib[si + 2];
        a = readMask(x, srcY);
      } else if (bitCount === 8) {
        const si = rowStart + x;
        if (si >= dib.length) continue;
        const idx = dib[si];
        const pi = paletteOffset + idx * 4;
        if (pi + 2 >= dib.length) continue;
        b = dib[pi];
        g = dib[pi + 1];
        r = dib[pi + 2];
        a = readMask(x, srcY);
      } else {
        throw new Error(`Unsupported ICO BMP bit depth: ${bitCount}`);
      }

      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = a;
    }
  }

  return { width, height, data: out };
}
