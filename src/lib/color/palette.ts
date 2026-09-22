/**
 * Palette extraction — turn a favicon/logo into a usable brand palette.
 *
 * Pipeline:
 *   decode (sharp, or our ICO decoder first)
 *     → downscale to 64px
 *     → drop transparent pixels
 *     → 5-bit histogram
 *     → weighted k-means in OKLab
 *     → score clusters and assign roles
 *     → suggest a status-page theme
 *     → contrast-correct the brand against that theme's background
 *
 * Why OKLab rather than sRGB: euclidean distance in sRGB does not match
 * perceived difference, so naive clustering splits a single visual "blue"
 * across several clusters while merging distinct light colors. OKLab fixes
 * both, and is the space Beacon's tokens are already authored in.
 *
 * Why score rather than take the most populous color: on a typical favicon
 * the dominant region is the background (white, or a flat dark square). The
 * brand color is the *chromatic* one, which may occupy far fewer pixels.
 */

import sharp from "sharp";

import { extractFromIco, isIco } from "./ico";
import {
  contrastRatio,
  ensureContrast,
  formatOklch,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  toHex,
  type OKLCH,
  type RGB,
} from "./oklch";
import { themeMeta, STATUS_THEMES, type StatusTheme } from "@/lib/status-themes";

/** How many clusters we ask k-means for. */
const K = 5;
/** Longest edge we analyze. Favicons are tiny; more pixels buys nothing. */
const ANALYZE_SIZE = 64;
/** Histogram precision per channel (5 bits → 32 levels). */
const HIST_BITS = 5;
/** Below this chroma we treat the image as effectively monochrome. */
const MONOCHROME_CHROMA = 0.04;

export type SwatchRole = "brand" | "accent" | "supporting";

export interface Swatch {
  hex: string;
  oklch: string;
  role: SwatchRole;
  /** Share of analyzed (non-transparent) pixels in this cluster, 0–1. */
  population: number;
  L: number;
  C: number;
  h: number;
}

export interface ExtractedPalette {
  swatches: Swatch[];
  /** Best brand-color candidate, already contrast-corrected for `suggestedTheme`. */
  brandColor: string;
  /** Brand color exactly as found, before any contrast correction. */
  rawBrandColor: string;
  /** True when contrast correction moved the brand color. */
  brandAdjustedForContrast: boolean;
  /** Contrast ratio of `brandColor` against the suggested theme background. */
  brandContrast: number;
  suggestedTheme: StatusTheme;
  /** How much to trust this — driven by the brand cluster's chroma. */
  confidence: "high" | "medium" | "low";
  /** Human-readable explanation for the UI. */
  notes: string[];
  /** Pixels actually analyzed after dropping transparent ones. */
  analyzedPixels: number;
}

/* ─── Deterministic PRNG ────────────────────────────────────── */

/**
 * mulberry32 — seeded so the same image always yields the same palette.
 * Users re-running extraction on the same favicon should not get a
 * different brand color each time.
 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── Decode ────────────────────────────────────────────────── */

export interface DecodedPixels {
  /** RGBA, 4 bytes per pixel. */
  data: Buffer;
  width: number;
  height: number;
}

/** Decode any supported image (including ICO) down to small raw RGBA. */
export async function decodeToRgba(input: Buffer): Promise<DecodedPixels> {
  let pipelineInput: Buffer = input;

  if (isIco(input)) {
    const extracted = extractFromIco(input);
    if (extracted.kind === "png") {
      pipelineInput = extracted.png;
    } else {
      // Already raw RGBA — hand sharp the buffer with explicit geometry.
      const { image } = extracted;
      const { data, info } = await sharp(image.data, {
        raw: { width: image.width, height: image.height, channels: 4 },
      })
        .resize(ANALYZE_SIZE, ANALYZE_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height };
    }
  }

  const { data, info } = await sharp(pipelineInput)
    .resize(ANALYZE_SIZE, ANALYZE_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/* ─── Histogram ─────────────────────────────────────────────── */

interface Bin {
  rgb: RGB;
  lab: { L: number; a: number; b: number };
  count: number;
}

function buildHistogram(px: DecodedPixels): { bins: Bin[]; total: number } {
  const shift = 8 - HIST_BITS;
  const counts = new Map<number, number>();
  let total = 0;

  for (let i = 0; i < px.data.length; i += 4) {
    const a = px.data[i + 3];
    // Anti-aliased glyph edges carry blended colors that aren't really in
    // the logo; requiring near-opaque keeps the palette honest.
    if (a < 200) continue;
    const r = px.data[i] >> shift;
    const g = px.data[i + 1] >> shift;
    const b = px.data[i + 2] >> shift;
    const key = (r << (HIST_BITS * 2)) | (g << HIST_BITS) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  const mid = 1 << (shift - 1); // center of the quantization bucket
  const bins: Bin[] = [];
  for (const [key, count] of counts) {
    const r = ((key >> (HIST_BITS * 2)) & ((1 << HIST_BITS) - 1)) << shift;
    const g = ((key >> HIST_BITS) & ((1 << HIST_BITS) - 1)) << shift;
    const b = (key & ((1 << HIST_BITS) - 1)) << shift;
    const rgb = { r: r + mid, g: g + mid, b: b + mid };
    const lch = rgbToOklch(rgb);
    bins.push({
      rgb,
      lab: {
        L: lch.L,
        a: lch.C * Math.cos((lch.h * Math.PI) / 180),
        b: lch.C * Math.sin((lch.h * Math.PI) / 180),
      },
      count,
    });
  }

  return { bins, total };
}

/* ─── Weighted k-means in OKLab ─────────────────────────────── */

interface Cluster {
  center: { L: number; a: number; b: number };
  weight: number;
}

function kmeans(bins: Bin[], k: number, rng: () => number): Cluster[] {
  if (bins.length === 0) return [];
  const effectiveK = Math.min(k, bins.length);

  // k-means++ seeding, weighted by bin population so seeds land on
  // colors that actually matter.
  const centers: { L: number; a: number; b: number }[] = [];
  const totalWeight = bins.reduce((s, b) => s + b.count, 0);

  let pick = rng() * totalWeight;
  let idx = 0;
  for (let i = 0; i < bins.length; i++) {
    pick -= bins[i].count;
    if (pick <= 0) {
      idx = i;
      break;
    }
  }
  centers.push({ ...bins[idx].lab });

  const dist2 = (
    p: { L: number; a: number; b: number },
    q: { L: number; a: number; b: number },
  ) => {
    const dL = p.L - q.L;
    const da = p.a - q.a;
    const db = p.b - q.b;
    return dL * dL + da * da + db * db;
  };

  while (centers.length < effectiveK) {
    let sum = 0;
    const weights = bins.map((bin) => {
      const nearest = Math.min(...centers.map((c) => dist2(bin.lab, c)));
      const w = nearest * bin.count;
      sum += w;
      return w;
    });
    if (sum <= 0) break; // all bins already coincide with a center
    let target = rng() * sum;
    let chosen = bins.length - 1;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centers.push({ ...bins[chosen].lab });
  }

  // Lloyd iterations. Favicons converge in a handful of passes.
  const assignment = new Array<number>(bins.length).fill(0);
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (let i = 0; i < bins.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(bins[i].lab, centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        moved = true;
      }
    }

    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
    for (let i = 0; i < bins.length; i++) {
      const s = sums[assignment[i]];
      const w = bins[i].count;
      s.L += bins[i].lab.L * w;
      s.a += bins[i].lab.a * w;
      s.b += bins[i].lab.b * w;
      s.w += w;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c].w > 0) {
        centers[c] = {
          L: sums[c].L / sums[c].w,
          a: sums[c].a / sums[c].w,
          b: sums[c].b / sums[c].w,
        };
      }
    }
    if (!moved && iter > 0) break;
  }

  const weights = centers.map(() => 0);
  for (let i = 0; i < bins.length; i++) weights[assignment[i]] += bins[i].count;

  return centers
    .map((center, i) => ({ center, weight: weights[i] }))
    .filter((c) => c.weight > 0);
}

/* ─── Scoring ───────────────────────────────────────────────── */

/**
 * How brand-like is this cluster?
 *
 *   population^0.5 — prominence matters, but sub-linearly, so a huge white
 *                    background can't outrank a small saturated glyph.
 *   chroma         — the single strongest brand signal.
 *   lightness      — penalize near-black and near-white, which are almost
 *                    always background or outline rather than brand.
 */
export function scoreCluster(lch: OKLCH, population: number): number {
  const prominence = Math.sqrt(Math.max(0, population));
  const saturation = Math.min(1, lch.C / 0.15);
  const lightness = 1 - Math.min(1, Math.abs(lch.L - 0.6) / 0.6);
  return prominence * (0.12 + 0.88 * saturation) * (0.25 + 0.75 * lightness);
}

/** Shortest angular distance between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/* ─── Theme suggestion ──────────────────────────────────────── */

/**
 * Pick the status-page theme whose accent hue sits closest to the brand hue.
 *
 * Derived from `themeMeta[*].preview.accent` at runtime rather than a
 * hardcoded hue table, so adding or retuning a theme automatically feeds
 * back into suggestions.
 */
export function suggestTheme(brand: OKLCH): StatusTheme {
  // Monochrome logos get the light, neutral theme — forcing a hue match on
  // atan2 noise would produce arbitrary results.
  if (brand.C < MONOCHROME_CHROMA) return "clean";

  let best: StatusTheme = "midnight";
  let bestDist = Infinity;
  for (const t of STATUS_THEMES) {
    const accent = parseHex(themeMeta[t].preview.accent);
    if (!accent) continue;
    const d = hueDistance(brand.h, rgbToOklch(accent).h);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/* ─── Main entry ────────────────────────────────────────────── */

export async function extractPalette(
  input: Buffer,
): Promise<ExtractedPalette> {
  const px = await decodeToRgba(input);
  const { bins, total } = buildHistogram(px);
  const notes: string[] = [];

  if (total === 0 || bins.length === 0) {
    throw new Error(
      "Image has no opaque pixels to sample — it may be fully transparent.",
    );
  }

  // Seed from the image content so results are stable per-image but still
  // vary sensibly across different images.
  const seed = bins.reduce(
    (acc, b) => (acc + b.rgb.r * 7 + b.rgb.g * 13 + b.rgb.b * 17 + b.count) >>> 0,
    total,
  );
  const clusters = kmeans(bins, K, makeRng(seed));

  const scored = clusters
    .map((c) => {
      const C = Math.sqrt(c.center.a * c.center.a + c.center.b * c.center.b);
      let h = (Math.atan2(c.center.b, c.center.a) * 180) / Math.PI;
      if (h < 0) h += 360;
      const lch: OKLCH = { L: c.center.L, C, h: C < 1e-6 ? 0 : h };
      const population = c.weight / total;
      return { lch, population, score: scoreCluster(lch, population) };
    })
    .sort((a, b) => b.score - a.score);

  const brand = scored[0];

  // Accent: the next-best cluster that is visibly a *different* hue.
  // Falling back to plain rank keeps monochrome logos from returning nothing.
  const accentCandidate =
    scored
      .slice(1)
      .find((s) => hueDistance(s.lch.h, brand.lch.h) >= 30 && s.lch.C >= 0.03) ??
    scored[1];

  const confidence: ExtractedPalette["confidence"] =
    brand.lch.C >= 0.1 ? "high" : brand.lch.C >= 0.05 ? "medium" : "low";

  if (confidence === "low") {
    notes.push(
      "This image is close to monochrome, so the brand color is a best guess. Consider setting it manually.",
    );
  }

  const suggestedTheme = suggestTheme(brand.lch);
  const themeBg = parseHex(themeMeta[suggestedTheme].preview.bg) ?? {
    r: 0,
    g: 0,
    b: 0,
  };

  const rawBrandRgb = oklchToRgb(brand.lch);
  const corrected = ensureContrast(rawBrandRgb, themeBg, 4.5);
  if (corrected.adjusted) {
    notes.push(
      `Brand color lightened for legibility on the ${themeMeta[suggestedTheme].name} background (contrast ${corrected.ratio.toFixed(1)}:1).`,
    );
  }

  const swatches: Swatch[] = scored.map((s, i) => {
    const rgb = oklchToRgb(s.lch);
    const role: SwatchRole =
      i === 0 ? "brand" : s === accentCandidate ? "accent" : "supporting";
    return {
      hex: toHex(rgb),
      oklch: formatOklch(s.lch),
      role,
      population: Number(s.population.toFixed(4)),
      L: Number(s.lch.L.toFixed(4)),
      C: Number(s.lch.C.toFixed(4)),
      h: Number(s.lch.h.toFixed(1)),
    };
  });

  return {
    swatches,
    brandColor: toHex(corrected.rgb),
    rawBrandColor: toHex(rawBrandRgb),
    brandAdjustedForContrast: corrected.adjusted,
    brandContrast: Number(contrastRatio(corrected.rgb, themeBg).toFixed(2)),
    suggestedTheme,
    confidence,
    notes,
    analyzedPixels: total,
  };
}
