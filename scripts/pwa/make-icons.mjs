#!/usr/bin/env node
// Renders Beacon's app icons (192, 512, 512 maskable, apple-touch-icon 180)
// from the same mark used in the sidebar header (src/components/brand/mark.tsx,
// the "Sweep" mark — concentric arcs + node + signal line).
//
// Deterministic: no external input, same output every run. Re-run after any
// change to the mark's path data or to the dark-mode background/primary
// tokens in src/app/globals.css.
//
// Usage: node scripts/pwa/make-icons.mjs

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "..", "public", "icons");

// Colors sourced from src/app/globals.css `.dark` block, converted from
// OKLCH to sRGB hex via src/lib/color/oklch.ts (oklchToRgb + toHex):
//   --card       oklch(0.195 0.018 255) -> #0f151d   (icon background)
//   --primary    oklch(0.78  0.13  195) -> #1ad1d1   (mark color)
const BG = "#0f151d";
const MARK_COLOR = "#1ad1d1";

// Beacon mark path data, copied verbatim from
// src/components/brand/mark.tsx (BeaconMark), viewBox 0 0 24 24.
const MARK_PATHS = [
  { d: "M5 14a7 7 0 0 1 14 0", opacity: 0.35 },
  { d: "M8 14a4 4 0 0 1 8 0", opacity: 0.7 },
  { d: "M12 14 L18 6", opacity: 1 },
];
// Node circle at the base of the arcs.
const NODE = { cx: 12, cy: 14, r: 1.6 };

// The mark's drawn content doesn't fill the full 0..24 viewBox (see the path
// data above) — its bounding box is roughly x:[5,19] y:[6,15.6], centered at
// (12, 10.8), not (12, 12). Recentering on the actual bbox (rather than the
// nominal viewBox center) keeps the mark visually centered in the icon
// canvas instead of looking pushed toward the bottom.
const BBOX = { cx: 12, cy: 10.8, w: 14, h: 9.6 };

/**
 * @param {number} size canvas size in px (square)
 * @param {object} opts
 * @param {boolean} opts.maskable keep the mark inside the 80% safe zone
 * @param {number} opts.cornerFrac corner radius as a fraction of size (0 = square)
 */
function buildSvg(size, { maskable = false, cornerFrac = 0, frac, stroke = 1.6 } = {}) {
  // Fraction of the canvas the mark's bbox WIDTH should occupy. Maskable
  // icons get extra headroom so the mark survives an aggressive OS mask
  // (circle, squircle, etc.) that can crop up to 20% off each edge.
  const targetFrac = frac ?? (maskable ? 0.6 : 0.72);
  const scale = (targetFrac * size) / BBOX.w;
  const r = cornerFrac * size;

  const pathEls = MARK_PATHS.map(
    (p) =>
      `<path d="${p.d}" fill="none" stroke="${MARK_COLOR}" stroke-width="${stroke}" stroke-linecap="round" opacity="${p.opacity}" />`,
  ).join("\n      ");

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${BG}" />
  <g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-BBOX.cx} ${-BBOX.cy})">
      ${pathEls}
      <circle cx="${NODE.cx}" cy="${NODE.cy}" r="${NODE.r}" fill="${MARK_COLOR}" stroke="none" />
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, opts: { maskable: false, cornerFrac: 0.22 } },
  { file: "icon-512.png", size: 512, opts: { maskable: false, cornerFrac: 0.22 } },
  { file: "icon-512-maskable.png", size: 512, opts: { maskable: true, cornerFrac: 0 } },
  { file: "apple-touch-icon-180.png", size: 180, opts: { maskable: false, cornerFrac: 0 } },
];

// Favicon sizes. Small sizes get a larger mark and thicker strokes so the
// arcs survive at 16x16 (design brief: "must work at 16x16 favicon").
const FAVICON_SIZES = [16, 32, 48];
const FAVICON_OPTS = { cornerFrac: 0.22, frac: 0.78, stroke: 2.2 };
const APP_DIR = path.join(__dirname, "..", "..", "src", "app");

/** Pack PNG buffers into a .ico (PNG-compressed entries, supported by every current browser). */
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const pngs = [];
  for (const size of FAVICON_SIZES) {
    const buf = await sharp(Buffer.from(buildSvg(size, FAVICON_OPTS))).resize(size, size).png().toBuffer();
    pngs.push({ size, buf });
  }
  await writeFile(path.join(APP_DIR, "favicon.ico"), packIco(pngs));
  console.log(`wrote src/app/favicon.ico (${FAVICON_SIZES.join(", ")})`);

  for (const t of TARGETS) {
    const svg = buildSvg(t.size, t.opts);
    const outPath = path.join(OUT_DIR, t.file);
    await sharp(Buffer.from(svg))
      .resize(t.size, t.size)
      .png()
      .toFile(outPath);
    console.log(`wrote ${path.relative(process.cwd(), outPath)} (${t.size}x${t.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
