const CACHE_NAME = 'rurality-v2';
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
  const url = new URL(request.url);

  // Cache-first only for our data files
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else: network-first (app shell, JS bundles, etc.)
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
