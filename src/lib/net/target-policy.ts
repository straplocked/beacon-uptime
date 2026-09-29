/**
 * Whether monitor checks (http, tcp, dns, ssl, ping) may target a private,
 * loopback, link-local, or otherwise reserved address (Vikunja 804).
 *
 * `ALLOW_PRIVATE_TARGETS` is unset by default, which means TRUE — Beacon is
 * commonly self-hosted, and monitors are expected to reach internal
 * infrastructure directly (a 192.168.x.x router, a LAN NAS, the host's own
 * Docker network) as a normal, intended use case. That is Chris's explicit
 * call: defaulting this to "safe" would silently break every existing
 * self-hosted install that monitors a private IP.
 *
 * Set it to exactly `"false"` to disable that and route every outbound
 * check through the same SSRF guard `src/lib/net/safe-fetch.ts` already
 * applies to user-supplied URLs elsewhere (status-page favicon extraction):
 * resolve the target first, and refuse to check it if it resolves to a
 * private/loopback/reserved address. This matters once monitor targets are
 * themselves attacker-influenced — i.e. any hosted, multi-tenant install —
 * since otherwise a monitor is a general-purpose internal network prober
 * (cloud metadata, other tenants' containers, etc). See docs/DEPLOYMENT.md.
 */
import { assertHostIsPublic } from "./safe-fetch";

export { SafeFetchError } from "./safe-fetch";

export function allowPrivateTargets(): boolean {
  return process.env.ALLOW_PRIVATE_TARGETS !== "false";
}

/**
 * Resolve `host` and throw `SafeFetchError` if it's private/reserved —
 * unless `ALLOW_PRIVATE_TARGETS` permits it (the default), in which case
 * this is a no-op. Used by every check type that doesn't already route
 * through `safeFetch()` (which does its own, redirect-aware version of
 * this for HTTP checks).
 */
export async function assertTargetAllowed(host: string): Promise<void> {
  if (allowPrivateTargets()) return;
  await assertHostIsPublic(host);
}
