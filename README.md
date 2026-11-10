# هاب Gemini — نسخه ۲.۰.۰

چت با Gemini و آب‌وهوای همه‌ی شهرها، با ظاهر تلگرامی. کل اپ یک فایل `index.html` است.

## فایل‌ها (همه کنار هم، بدون پوشه)
| فایل | وظیفه |
|---|---|
| index.html | کل اپ (ظاهر + منطق) |
| manifest.json، icon-192.png، icon-512.png، icon-maskable-512.png | نصب به‌عنوان اپ روی گوشی/ویندوز |
| sw.js | فقط پاک‌سازی سرویس‌ورکر و کش قدیمی |
| cloudflare-worker.js | کدی که باید داخل Cloudflare Worker بگذاری (روی گیت‌هاب فقط برای نگهداری است) |

## راه‌اندازی
1. **گیت‌هاب:** فایل‌های قدیمی `app.js`، `style.css`، `proxy.py` و پوشه‌ی `icons` را پاک کن. بعد همه‌ی فایل‌های این بسته را یک‌جا آپلود کن (Add file ← Upload files ← Commit).
2. **Cloudflare:** Worker ← Edit code ← همه‌چیز را پاک کن ← محتوای `cloudflare-worker.js` را بگذار ← Deploy.
3. **Secretها:** Worker ← Settings ← Variables and Secrets. پنج Secret به اسم‌های `GOOGLE_KEY_1` تا `GOOGLE_KEY_5` با نوع Secret بساز.
4. اگر آدرس سایتت غیر از `https://leomahmood.github.io` است، لیست `ALLOWED_ORIGINS` بالای Worker را عوض کن.
5. اگر Worker جدید ساختی، آدرسش را در `index.html` خط `var PROXY_URL` عوض کن.

## بررسی سلامت
- آدرس Worker را در مرورگر باز کن: باید `{"ok":true,"service":"gemini-hub","version":"2.0.0","geminiKeys":5}` ببینی.
- داخل اپ: ⋮ ← «تست اتصال به سرور».
- پایین تنظیمات نسخه‌ی اپ (v2.0.0) دیده می‌شود. اگر چیز دیگری دیدی، نسخه‌ی قدیمی لود شده است.
