// Service Worker ساده: فایل‌های اصلی رو کش می‌کنه
// تا اپ حتی با اینترنت ضعیف هم باز بشه (چت کردن البته نیاز به اینترنت داره)

const CACHE_NAME = 'ai-hub-v1';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // فقط برای فایل‌های خود اپ کش استفاده کن، درخواست‌های API رو دست نزن
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
