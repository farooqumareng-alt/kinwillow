// KinWillow service worker.
//
// This makes the site installable and gives a friendly page when there is no
// connection. It is deliberately NOT an offline copy of the vault:
//
//   * vault pages, API responses and anything from Supabase are never cached —
//     a phone or shared computer must not keep someone's vault on disk after
//     they sign out;
//   * only the app shell's static, public files are cached (built scripts and
//     styles, icons, the offline page).
//
// Bump VERSION to discard old caches after changing this file.
const VERSION = "v1";
const STATIC_CACHE = `kw-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/logo-symbol.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kw-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE.includes(url.pathname) ||
    url.pathname === "/favicon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Other origins (Supabase, Stripe) are left entirely to the browser.
  if (url.origin !== self.location.origin) return;

  // Public, fingerprinted files: serve from cache, fetch and store on a miss.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Pages: always from the network, never stored. If there is no connection,
  // show the offline page instead of the browser's error screen.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (API calls, data) goes straight to the network, untouched.
});
