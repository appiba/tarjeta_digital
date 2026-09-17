const CACHE_NAME = 'loyalty-platform-api-v10';
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './solicitud.html',
  './assets/css/main.css',
  './assets/css/admin.css',
  './assets/css/business.css',
  './assets/css/client.css',
  './assets/js/utils.js',
  './assets/js/api.js',
  './assets/js/auth.js',
  './assets/js/admin.js',
  './assets/js/business.js',
  './assets/js/client.js',
  './assets/js/register.js',
  './assets/js/request.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
