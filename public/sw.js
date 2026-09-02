const CACHE_NAME = 'zulwms-scanner-v1';
const SHELL_FILES = ['/scanner.html', '/scanner.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// App shell: cache-first (so scanner.html/js always load even with zero connectivity).
// API calls (/api/...): always go to network -- never cache scan data.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // let it hit network / fail naturally when offline

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
