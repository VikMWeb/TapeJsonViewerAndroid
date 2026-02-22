const CACHE_NAME = "tape-json-viewer-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./data/products.json",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Stale-While-Revalidate для JSON, Cache-First для shell
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Навігація: віддати index.html з кешу (офлайн)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(req))
    );
    return;
  }

  // JSON: кеш + фонове оновлення
  if (url.pathname.endsWith("/data/products.json") || url.pathname.endsWith("products.json")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Інші ресурси: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await networkPromise) || new Response("[]", {
    headers: { "Content-Type": "application/json" }
  });

}
