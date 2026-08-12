const CACHE_NAME = 'firmbooks-v1-shell';
const APP_SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache Vite's development modules or HMR transport.
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: 'The server is unavailable while offline.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })));
    return;
  }

  // App navigations are network-first so test sessions and deployments always
  // receive the newest shell. Offline mode shows a static, data-free fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('/offline.html')))
  );
});
