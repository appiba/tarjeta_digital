const CACHE_NAME = 'loyalty-phase-1-v1';
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
  './assets/js/request.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
