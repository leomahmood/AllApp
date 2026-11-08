# هاب هوش مصنوعی (فقط Gemini)

اپ وب (PWA) برای چت با Gemini + آب‌وهوای همه‌ی شهرها.
کلیدهای Gemini فقط روی Cloudflare Worker (به‌صورت Secret) هستن و هیچ‌جا توی کد یا گیت‌هاب نیستن.

## فایل‌ها
| فایل | وظیفه |
|---|---|
| index.html / style.css / app.js | خود اپ |
| manifest.json + icons/ | نصب به‌عنوان اپ روی گوشی/ویندوز |
| sw.js | فقط پاک‌سازی کش و سرویس‌ورکر قدیمی (دیگه کش‌کننده نیست) |
| cloudflare-worker.js | کدی که باید داخل Cloudflare Worker بذاری (روی گیت‌هاب فقط برای نگهداریه) |

## راه‌اندازی
1. همه‌ی فایل‌های این پوشه (به‌همراه پوشه‌ی icons) رو روی گیت‌هاب آپلود کن.
2. توی Cloudflare Worker، کد `cloudflare-worker.js` رو جایگزین کن و Deploy بزن.
3. توی Worker: Settings > Variables and Secrets، پنج Secret به اسم GOOGLE_KEY_1 تا GOOGLE_KEY_5 بساز.
4. اگه آدرس سایتت غیر از https://leomahmood.github.io هست، لیست ALLOWED_ORIGINS بالای Worker رو عوض کن.
