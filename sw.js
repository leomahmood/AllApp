// این فایل فقط برای پاک‌سازیه.
// دستگاهی که نسخه‌ی قدیمی (با کش) داره، با این فایل خودش رو حذف و کش رو خالی می‌کنه.
// بعد از اون هیچ سرویس‌ورکر و کشی توی کار نیست و آپدیت‌ها مستقیم می‌رسن.

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
