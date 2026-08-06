// هر بار که نسخه جدید می‌دهی، این عدد را عوض کن.
// مثلاً v4، بعد v5، بعد v6
const CACHE_NAME = 'ai-hub-v4';

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
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        await cache.addAll(FILES_TO_CACHE);
      } catch (error) {
        console.warn('بعضی فایل‌ها در کش ذخیره نشدند:', error);
      }

      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );

      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // فقط درخواست‌های GET و فقط فایل‌های خود اپ را مدیریت کن
  if (requestUrl.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // همیشه اول نسخه تازه را از اینترنت بگیر
        const freshResponse = await fetch(event.request, {
          cache: 'no-store'
        });

        // یک کپی هم برای آفلاین ذخیره کن
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, freshResponse.clone());

        return freshResponse;
      } catch (error) {
        // اگر آفلاین بود، از کش قدیمی استفاده کن
        const cachedResponse = await caches.match(event.request);
        return cachedResponse || Response.error();
      }
    })()
  );
});
