/*
 * sw.js — تشغيل التطبيق دون اتصال (PWA) عبر تخزين الملفات الأساسية.
 */
const CACHE_NAME = 'd-notepad-v5';
const ASSETS = [
  './',
  './index.html',
  './about.html',
  './about-en.html',
  './guides/arabic-text-encodings.html',
  './guides/online-notepad-arabic.html',
  './llms.txt',
  './assets/style.css',
  './assets/about.css',
  './assets/app.js',
  './assets/codec.js',
  './assets/i18n.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png',
  './manifest.webmanifest',
  './robots.txt',
  './sitemap.xml',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
