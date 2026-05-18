const CACHE_NAME = 'rurality-v4';
const DATA_ASSETS = [
  '/data/ruca.json',
  '/data/rucc.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(DATA_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Don't intercept cross-origin requests (Census, Nominatim, FCC, etc.) —
  // let the page's own retry/error handling deal with them.
  if (url.origin !== self.location.origin) return;

  // Cache-first only for our data files
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else: network-first (app shell, JS bundles, etc.).
  // Fall back to cache, and never resolve to undefined.
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || Response.error())
    )
  );
});
