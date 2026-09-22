/**
 * Favicon discovery + palette extraction.
 *
 * Bridges a user-supplied URL to an ExtractedPalette. Accepts three inputs
 * and does the least surprising thing with each:
 *   1. A direct image URL      → fetch + extract.
 *   2. A page URL (returns HTML) → scan the markup for the best <link rel
 *      ="...icon..."> and extract that.
 *   3. A bare domain            → fall back to <origin>/favicon.ico.
 *
 * All fetching goes through safeFetch, so every hop is SSRF-guarded. HTML is
 * scanned with a regex rather than a DOM parser — favicon <link> tags are
 * simple and self-contained, and this keeps a heavy HTML-parsing dependency
 * (and its own attack surface) out of the request path.
 */

import { extractPalette, type ExtractedPalette } from "./palette";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";

const IMAGE_TYPES = [
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/ico",
  "image/icon",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
];

const FETCH_OPTS = {
  timeoutMs: 6000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
};

export interface FaviconResult extends ExtractedPalette {
  /** The image URL the palette was actually extracted from. */
  sourceUrl: string;
}

/** Prepend https:// when the user typed a bare domain. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isImageType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return IMAGE_TYPES.includes(base);
}

/**
 * Pull candidate icon hrefs out of raw HTML, best-first.
 *
 * Prefers larger declared sizes, then apple-touch-icon (usually a clean
 * high-res PNG), then any rel containing "icon".
 */
export function parseIconLinks(html: string, baseUrl: string): string[] {
  const links: { href: string; score: number }[] = [];
  // Match <link ...> tags; grab rel, href, sizes in any order.
  const linkTag = /<link\b[^>]*>/gi;
  const attr = (tag: string, name: string): string | null => {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
    return m ? m[1] : null;
  };

  let match: RegExpExecArray | null;
  while ((match = linkTag.exec(html)) !== null) {
    const tag = match[0];
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = attr(tag, "href");
    if (!href) continue;

    let score = 0;
    if (rel.includes("apple-touch-icon")) score += 50;
    const sizes = attr(tag, "sizes");
    if (sizes) {
      const px = parseInt(sizes.split("x")[0], 10);
      if (Number.isFinite(px)) score += Math.min(px, 512);
    }
    if (/\.svg(\?|$)/i.test(href)) score += 30; // scalable → crisp
    links.push({ href, score });
  }

  links.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const { href } of links) {
    try {
      const abs = new URL(href, baseUrl).toString();
      if (!seen.has(abs)) {
        seen.add(abs);
        resolved.push(abs);
      }
    } catch {
      // skip un-resolvable href
    }
  }
  return resolved;
}

/**
 * Resolve `input` to icon bytes and extract a palette.
 *
 * Throws SafeFetchError for network/SSRF issues, or a plain Error when no
 * usable icon can be found or decoded.
 */
export async function extractFromUrl(input: string): Promise<FaviconResult> {
  const url = normalizeUrl(input);
  const origin = new URL(url).origin;

  // 1. Fetch whatever the URL points at.
  const first = await safeFetch(url, FETCH_OPTS);

  // 1a. Direct image → done.
  if (isImageType(first.contentType)) {
    const palette = await extractPalette(first.body);
    return { ...palette, sourceUrl: first.url };
  }

  // 1b. HTML → look for declared icons, try them best-first.
  const looksHtml =
    (first.contentType ?? "").includes("html") ||
    first.body.subarray(0, 512).toString("utf8").toLowerCase().includes("<html");

  const candidates: string[] = [];
  if (looksHtml) {
    const html = first.body.toString("utf8");
    candidates.push(...parseIconLinks(html, first.url));
  }
  // 2. Always include the conventional fallback last.
  candidates.push(`${origin}/favicon.ico`);

  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      const res = await safeFetch(candidate, {
        ...FETCH_OPTS,
        allowedContentTypes: ["image/"],
      });
      const palette = await extractPalette(res.body);
      return { ...palette, sourceUrl: res.url };
    } catch (err) {
      lastErr = err;
      // Try the next candidate.
    }
  }

  if (lastErr instanceof SafeFetchError) throw lastErr;
  throw new Error(
    "Could not find a usable favicon or logo at that URL. Try linking directly to an image.",
  );
}
