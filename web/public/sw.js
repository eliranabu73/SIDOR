// Minimal service worker for סידור4S PWA.
// Strategy:
//   - Navigation requests: network-first, fall back to cached shell on offline.
//   - Same-origin static assets (_next/static, /icon-*, /manifest.json, /*.svg):
//     stale-while-revalidate.
//   - API requests (cross-origin or /v1/*): network only, never cached
//     (avoids stale schedule data + auth issues).
const VERSION = "v1";
const STATIC_CACHE = `sidor4s-static-${VERSION}`;
const RUNTIME_CACHE = `sidor4s-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/schedule",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
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
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.json" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  );
}

function isApiRequest(url) {
  return url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cross-origin (Supabase, backend API): pass through.
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) return; // never cache API

  // Navigation requests: network-first with shell fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/schedule")),
        ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
