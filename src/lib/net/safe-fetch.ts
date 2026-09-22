/**
 * SSRF-guarded fetch for user-supplied URLs.
 *
 * The palette extractor takes a URL from the user and fetches it *from the
 * server*. Without guards that is a textbook SSRF primitive: an attacker
 * points it at `http://169.254.169.254/latest/meta-data/` (cloud metadata),
 * `http://127.0.0.1:6380` (this deployment's Redis), or any RFC1918 host and
 * uses Beacon as a network probe — the response body, size, and timing all
 * leak information back.
 *
 * Defenses here:
 *   1. Scheme allowlist (http/https only — no file:, gopher:, ftp:).
 *   2. DNS resolution up front, with *every* resolved address checked against
 *      a blocklist of loopback / private / link-local / CGNAT / multicast /
 *      reserved ranges, for both IPv4 and IPv6 (including v4-mapped v6).
 *   3. Redirects followed manually, re-validating the host at every hop —
 *      a public URL that 302s to 127.0.0.1 is the classic bypass.
 *   4. Hard timeout, response size cap (enforced while streaming, not just
 *      from Content-Length, which a hostile server can lie about), and a
 *      content-type allowlist.
 *
 * Known residual risk: DNS rebinding. We validate the addresses returned by
 * our resolver, then hand the hostname to fetch(), which resolves again — a
 * hostile resolver could return a public IP to us and a private one to the
 * socket. Closing that gap fully requires pinning the connection to the
 * validated IP via a custom undici dispatcher (undici is not a direct
 * dependency here). The window is narrow and this endpoint is authenticated
 * and rate-limited; revisit if either changes.
 */

import { lookup } from "dns/promises";

export interface SafeFetchOptions {
  /** Abort after this many ms. Default 5000. */
  timeoutMs?: number;
  /** Reject bodies larger than this. Default 2 MiB. */
  maxBytes?: number;
  /** Maximum redirect hops to follow. Default 3. */
  maxRedirects?: number;
  /** Allowed `Content-Type` prefixes. Empty array disables the check. */
  allowedContentTypes?: string[];
  /** Sent as the User-Agent header. */
  userAgent?: string;
}

export interface SafeFetchResult {
  body: Buffer;
  contentType: string | null;
  /** Final URL after redirects. */
  url: string;
  status: number;
}

/** Thrown for every rejection so callers can surface a safe message. */
export class SafeFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_url"
      | "blocked_host"
      | "dns_failure"
      | "timeout"
      | "too_large"
      | "bad_content_type"
      | "too_many_redirects"
      | "http_error"
      | "network_error",
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

/* ─── IP range checks ───────────────────────────────────────── */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

const inCidr = (ip: number, base: string, bits: number): boolean => {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
};

/**
 * True when the IPv4 address is NOT safe to fetch from.
 * Covers every special-purpose range in IANA's registry that could reach
 * infrastructure rather than the public internet.
 */
export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → refuse
  return (
    inCidr(n, "0.0.0.0", 8) || // "this network"
    inCidr(n, "10.0.0.0", 8) || // private
    inCidr(n, "100.64.0.0", 10) || // CGNAT
    inCidr(n, "127.0.0.0", 8) || // loopback
    inCidr(n, "169.254.0.0", 16) || // link-local (cloud metadata)
    inCidr(n, "172.16.0.0", 12) || // private
    inCidr(n, "192.0.0.0", 24) || // IETF protocol assignments
    inCidr(n, "192.0.2.0", 24) || // TEST-NET-1
    inCidr(n, "192.88.99.0", 24) || // 6to4 relay anycast
    inCidr(n, "192.168.0.0", 16) || // private
    inCidr(n, "198.18.0.0", 15) || // benchmarking
    inCidr(n, "198.51.100.0", 24) || // TEST-NET-2
    inCidr(n, "203.0.113.0", 24) || // TEST-NET-3
    inCidr(n, "224.0.0.0", 4) || // multicast
    inCidr(n, "240.0.0.0", 4) // reserved + broadcast
  );
}

function expandIpv6(ip: string): number[] | null {
  let addr = ip.trim().toLowerCase();
  // Strip zone index (fe80::1%eth0)
  const pct = addr.indexOf("%");
  if (pct !== -1) addr = addr.slice(0, pct);

  // Rewrite a trailing IPv4 literal (::ffff:192.168.0.1, 64:ff9b::10.0.0.1)
  // into the two hex groups it actually occupies, so the rest of the parser
  // can treat it as ordinary groups. Splicing the text — rather than tracking
  // the four bytes separately — keeps the `::` zero-fill arithmetic correct;
  // getting this wrong silently un-blocks ::ffff:127.0.0.1.
  const v4 = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    if (n === null) return null;
    const g1 = ((n >>> 16) & 0xffff).toString(16);
    const g2 = (n & 0xffff).toString(16);
    addr = addr.slice(0, addr.length - v4[1].length) + `${g1}:${g2}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (s: string): number[][] =>
    s.length === 0
      ? []
      : s.split(":").map((g) => {
          if (!/^[0-9a-f]{1,4}$/.test(g)) return [NaN, NaN];
          const v = parseInt(g, 16);
          return [(v >> 8) & 255, v & 255];
        });

  const head = parseGroups(halves[0]).flat();
  const rest = halves.length === 2 ? parseGroups(halves[1]).flat() : [];

  let bytes: number[];
  if (halves.length === 2) {
    const fill = 16 - head.length - rest.length;
    if (fill < 0) return null;
    bytes = [...head, ...new Array(fill).fill(0), ...rest];
  } else {
    bytes = head;
  }

  if (bytes.length !== 16 || bytes.some((b) => Number.isNaN(b))) return null;
  return bytes;
}

/** True when the IPv6 address is NOT safe to fetch from. */
export function isBlockedIpv6(ip: string): boolean {
  const b = expandIpv6(ip);
  if (!b) return true;

  const isZeroPrefix = (n: number) => b.slice(0, n).every((x) => x === 0);

  // ::/128 unspecified and ::1/128 loopback
  if (isZeroPrefix(15) && (b[15] === 0 || b[15] === 1)) return true;
  // ::ffff:0:0/96 — IPv4-mapped. Unwrap and apply the v4 rules.
  if (isZeroPrefix(10) && b[10] === 0xff && b[11] === 0xff) {
    return isBlockedIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  // 64:ff9b::/96 — NAT64. Unwrap likewise.
  if (
    b[0] === 0x00 &&
    b[1] === 0x64 &&
    b[2] === 0xff &&
    b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  ) {
    return isBlockedIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  // 100::/64 discard-only
  if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0))
    return true;
  // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8)
    return true;
  // fc00::/7 unique local
  if ((b[0] & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
  // ff00::/8 multicast
  if (b[0] === 0xff) return true;

  return false;
}

export function isBlockedAddress(ip: string): boolean {
  return ip.includes(":") ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

/**
 * Resolve a hostname and reject if ANY returned address is non-public.
 * Checking every address matters: a hostname that resolves to both a public
 * and a private IP could otherwise be used to reach the private one.
 */
export async function assertHostIsPublic(hostname: string): Promise<void> {
  // A bare IP literal never hits DNS — validate it directly.
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(literal) || literal.includes(":")) {
    if (isBlockedAddress(literal)) {
      throw new SafeFetchError(
        `Refusing to fetch a private or reserved address (${literal})`,
        "blocked_host",
      );
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new SafeFetchError(`Could not resolve ${hostname}`, "dns_failure");
  }
  if (addresses.length === 0) {
    throw new SafeFetchError(`Could not resolve ${hostname}`, "dns_failure");
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new SafeFetchError(
        `${hostname} resolves to a private or reserved address`,
        "blocked_host",
      );
    }
  }
}

/* ─── Fetch ─────────────────────────────────────────────────── */

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    timeoutMs = 5000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    allowedContentTypes = [],
    userAgent = "BeaconUptime/1.0 (+palette-extractor)",
  } = opts;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("Not a valid URL", "invalid_url");
  }

  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new SafeFetchError(
        `Unsupported scheme: ${current.protocol}`,
        "invalid_url",
      );
    }
    await assertHostIsPublic(current.hostname);

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SafeFetchError("Timed out", "timeout");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": userAgent, Accept: "image/*,*/*;q=0.8" },
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new SafeFetchError("Timed out", "timeout");
      }
      throw new SafeFetchError(
        err instanceof Error ? err.message : "Network error",
        "network_error",
      );
    }

    // Redirect: re-enter the loop so the new host is validated too.
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const location = res.headers.get("location");
      if (!location) {
        throw new SafeFetchError(
          `Redirect with no Location header (${res.status})`,
          "http_error",
        );
      }
      if (hop === maxRedirects) {
        throw new SafeFetchError("Too many redirects", "too_many_redirects");
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new SafeFetchError("Invalid redirect target", "invalid_url");
      }
      continue;
    }

    try {
      if (!res.ok) {
        throw new SafeFetchError(
          `Upstream returned ${res.status}`,
          "http_error",
        );
      }

      const contentType = res.headers.get("content-type");
      if (allowedContentTypes.length > 0) {
        const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
        if (!allowedContentTypes.some((p) => base.startsWith(p))) {
          throw new SafeFetchError(
            `Unexpected content type: ${base || "none"}`,
            "bad_content_type",
          );
        }
      }

      // Trust Content-Length only as an early-out; enforce the real cap
      // while reading, since the header can be absent or a lie.
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new SafeFetchError(
          `Response too large (${declared} bytes)`,
          "too_large",
        );
      }

      const body = await readCapped(res, maxBytes);
      return {
        body,
        contentType,
        url: current.toString(),
        status: res.status,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new SafeFetchError("Too many redirects", "too_many_redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new SafeFetchError(
          `Response exceeded ${maxBytes} bytes`,
          "too_large",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, total);
}
