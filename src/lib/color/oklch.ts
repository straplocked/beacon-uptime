/**
 * Color math — sRGB ↔ linear ↔ OKLab ↔ OKLCH, plus WCAG contrast.
 *
 * Beacon's design tokens are authored in OKLCH (see src/app/globals.css), so
 * palette extraction works in the same perceptual space rather than raw sRGB.
 * That matters for two reasons:
 *   1. k-means clustering in OKLab groups colors the way a human would;
 *      euclidean distance in sRGB does not.
 *   2. Nudging a color for contrast means changing L only, leaving hue and
 *      chroma intact — impossible to do cleanly in sRGB.
 *
 * OKLab transform constants: Björn Ottosson,
 * https://bottosson.github.io/posts/oklab/
 */

export interface RGB {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
}

export interface OKLab {
  /** Perceptual lightness, 0–1 */
  L: number;
  /** Green–red axis */
  a: number;
  /** Blue–yellow axis */
  b: number;
}

export interface OKLCH {
  /** Perceptual lightness, 0–1 */
  L: number;
  /** Chroma, 0–~0.4 for in-gamut sRGB */
  C: number;
  /** Hue angle in degrees, 0–360 */
  h: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/* ─── sRGB ↔ linear ─────────────────────────────────────────── */

/** sRGB channel (0–1) → linear-light (0–1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear-light channel (0–1) → sRGB (0–1). */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308
    ? c * 12.92
    : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/* ─── sRGB ↔ OKLab ──────────────────────────────────────────── */

export function rgbToOklab({ r, g, b }: RGB): OKLab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToRgb({ L, a, b }: OKLab): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: Math.round(clamp(linearToSrgb(lr), 0, 1) * 255),
    g: Math.round(clamp(linearToSrgb(lg), 0, 1) * 255),
    b: Math.round(clamp(linearToSrgb(lb), 0, 1) * 255),
  };
}

/* ─── OKLab ↔ OKLCH ─────────────────────────────────────────── */

export function oklabToOklch({ L, a, b }: OKLab): OKLCH {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Hue is meaningless for achromatic colors; normalize to 0 so callers
  // don't act on atan2 noise around the origin.
  return { L, C, h: C < 1e-6 ? 0 : h };
}

export function oklchToOklab({ L, C, h }: OKLCH): OKLab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export const rgbToOklch = (rgb: RGB): OKLCH => oklabToOklch(rgbToOklab(rgb));
export const oklchToRgb = (c: OKLCH): RGB => oklabToRgb(oklchToOklab(c));

/* ─── Hex ───────────────────────────────────────────────────── */

/** Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` (alpha ignored). Null if invalid. */
export function parseHex(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(m)) return null;
  if (m.length === 3) {
    return {
      r: parseInt(m[0] + m[0], 16),
      g: parseInt(m[1] + m[1], 16),
      b: parseInt(m[2] + m[2], 16),
    };
  }
  if (m.length === 6 || m.length === 8) {
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16),
    };
  }
  return null;
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Format as a CSS `oklch(L C H)` string, matching the token system. */
export function formatOklch({ L, C, h }: OKLCH, precision = 3): string {
  return `oklch(${L.toFixed(precision)} ${C.toFixed(precision)} ${h.toFixed(1)})`;
}

/* ─── WCAG contrast ─────────────────────────────────────────── */

/** WCAG 2.1 relative luminance (0–1). */
export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * srgbToLinear(r / 255) +
    0.7152 * srgbToLinear(g / 255) +
    0.0722 * srgbToLinear(b / 255)
  );
}

/** WCAG 2.1 contrast ratio, 1–21. Order-independent. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Push `color` lighter or darker (in OKLCH L only) until it reaches
 * `target` contrast against `bg`, preserving hue and chroma.
 *
 * Direction is chosen by whichever side of the background has more headroom,
 * so a brand color on a dark status-page background brightens rather than
 * collapsing to black. Returns the original color unchanged when it already
 * passes, or the best achievable color when the target is unreachable
 * (e.g. a mid-gray background where neither direction can hit 7:1).
 */
export function ensureContrast(
  color: RGB,
  bg: RGB,
  target = 4.5,
): { rgb: RGB; ratio: number; adjusted: boolean } {
  const initial = contrastRatio(color, bg);
  if (initial >= target) return { rgb: color, ratio: initial, adjusted: false };

  const base = rgbToOklch(color);
  const bgLum = relativeLuminance(bg);
  // Lighten against dark backgrounds, darken against light ones.
  const goLighter = bgLum < 0.5;

  let best = color;
  let bestRatio = initial;

  // Walk L in fine steps rather than binary-searching: contrast is monotonic
  // in L here, but sRGB gamut clipping at high chroma makes it slightly
  // non-smooth, and a linear scan is cheap at this resolution.
  for (let i = 1; i <= 100; i++) {
    const L = goLighter
      ? Math.min(1, base.L + i * 0.01)
      : Math.max(0, base.L - i * 0.01);
    const candidate = oklchToRgb({ ...base, L });
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    if (ratio >= target) {
      return { rgb: candidate, ratio, adjusted: true };
    }
    if (L === 0 || L === 1) break;
  }

  return { rgb: best, ratio: bestRatio, adjusted: bestRatio > initial };
}
