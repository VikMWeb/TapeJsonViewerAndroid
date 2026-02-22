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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Навігація: index.html з кешу (offline)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(req))
    );
    return;
  }

  // products.json: network-first (щоб кнопка "Оновити online" завжди тягнула свіже)
  if (url.pathname.endsWith("/data/products.json") || url.pathname.endsWith("products.json")) {
    event.respondWith(networkFirstJSON(req));
    return;
  }

  // Інше: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

async function networkFirstJSON(req) {
  const url = new URL(req.url);
  const cache = await caches.open(CACHE_NAME);

  // нормалізуємо ключ кешу без query (?t=...)
  const normalized = new Request(url.origin + url.pathname, { method: "GET" });

  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      await cache.put(normalized, fresh.clone());
      return fresh;
    }
  } catch {}

  const cached = await cache.match(normalized);
  return cached || new Response("[]", {
    headers: { "Content-Type": "application/json" }
  });
}
