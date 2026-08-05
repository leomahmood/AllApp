// // Service Worker: همیشه اول از اینترنت نسخه‌ی تازه رو می‌گیره.
// // فقط وقتی آفلاینی (اصلاً اینترنت نداری)، از کش قدیمی استفاده می‌کنه.
// // هر بار که این عدد رو عوض کنی (v2, v3, ...)، مرورگرها مجبور می‌شن کش قدیمی رو کامل دور بریزن.

// const CACHE_NAME = 'ai-hub-v3';
// const FILES_TO_CACHE = [
//   './',
//   './index.html',
//   './style.css',
//   './app.js',
//   './manifest.json',
//   './icons/icon-192.png',
//   './icons/icon-512.png'
// ];

// self.addEventListener('install', (event) => {
//   event.waitUntil(
//     caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
//   );
//   self.skipWaiting();
// });

// self.addEventListener('activate', (event) => {
//   event.waitUntil(
//     caches.keys().then(keys =>
//       Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
//     )
//   );
//   self.clients.claim();
// });

// self.addEventListener('fetch', (event) => {
//   const requestUrl = new URL(event.request.url);

//   // فقط برای فایل‌های خود اپ (هم‌دامنه) دخالت کن.
//   // درخواست‌های به سایت‌های دیگه (آب‌وهوا، proxy هوش مصنوعی و...) رو دست‌نخورده بذار
//   // که خود مرورگر مستقیم مدیریتشون کنه.
//   if (requestUrl.origin !== self.location.origin || event.request.method !== 'GET') {
//     return;
//   }

//   event.respondWith(
//     fetch(event.request)
//       .then(networkResponse => {
//         const clone = networkResponse.clone();
//         caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
//         return networkResponse;
//       })
//       .catch(() => caches.match(event.request).then(cached => cached || Response.error()))
//   );
// });
