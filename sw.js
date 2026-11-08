// این Service Worker فقط برای پاک‌سازیه.
// هر دستگاهی که نسخه‌ی قدیمی (با کش) رو داره، با این فایل خودش رو حذف و کش رو خالی می‌کنه.
// بعد از این، دیگه هیچ سرویس‌ورکر و کشی توی کار نیست و آپدیت‌ها مستقیم میان.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach((w) => w.navigate(w.url));
  })());
});
