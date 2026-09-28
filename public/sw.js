// Beacon Uptime service worker — hand-written, no build step.
//
// Strategy (see also docs in CLAUDE.md / the PWA work item):
//   - /api/* and /s/* (public status pages) are NEVER intercepted: no
//     respondWith(), no caching, request goes straight to the network
//     exactly as if there were no service worker.
//   - /_next/static/* (immutable, content-hashed) and /icons/* (app icons):
//     cache-first.
//   - Page navigations: network-first. On failure, fall back to the single
//     static, unauthenticated offline page — never to a previously cached
//     copy of an actual page, so one signed-in user's dashboard HTML can
//     never be served to a different user from cache.
//   - Navigation responses themselves are never written to the cache.
//
// Bump VERSION whenever this file's caching behavior changes so activate()
// clears the old cache instead of serving stale entries forever.
const VERSION = "v1";
const CACHE_NAME = `beacon-static-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes or public status pages. This also covers
  // /api/public and /api/mcp, which live under /api/.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/s/")) {
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Everything else (fonts, other static files, etc.): default network
  // behavior, untouched by this worker.
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    // Intentionally not cached: this may be an authenticated, per-user
    // page. Only ever read from the network here.
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}
