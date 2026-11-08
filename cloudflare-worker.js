/**
 * cloudflare-worker.js
 *
 * نسخه‌ی آنلاین proxy.py — همون کار رو می‌کنه ولی روی سرورهای Cloudflare
 * اجرا می‌شه، نه روی کامپیوتر خودت. یعنی همیشه روشنه و نیازی به هیچ
 * ترمینال بازی نداره.
 *
 * نحوه‌ی نصب: این کد رو کامل کپی کن و توی ویرایشگر آنلاین Cloudflare
 * Workers (که مرحله به مرحله توضیح دادم) پیست کن و Deploy بزن.
 */

const PROVIDERS = {
  anthropic: {
    url: () => "https://api.anthropic.com/v1/messages",
    headers: (apiKey) => ({
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  openai: {
    url: () => "https://api.openai.com/v1/chat/completions",
    headers: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
  google: {
    url: (apiKey) =>
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    headers: () => ({ "Content-Type": "application/json" }),
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request) {
    // درخواست "پیش‌بررسی" مرورگر قبل از درخواست اصلی
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "فقط POST پشتیبانی می‌شه" }, 405);
    }

    const url = new URL(request.url);
    const provider = url.pathname.replace(/^\/proxy\//, "").replace(/\/$/, "");
    const config = PROVIDERS[provider];

    if (!config) {
      return jsonResponse({ error: `provider ناشناخته: ${provider}` }, 404);
    }

    let apiKey, payload;
    try {
      const body = await request.json();
      apiKey = body.apiKey;
      payload = body.payload;
    } catch (e) {
      return jsonResponse({ error: "بدنه‌ی درخواست نامعتبره" }, 400);
    }

    try {
      const upstream = await fetch(config.url(apiKey), {
        method: "POST",
        headers: config.headers(apiKey),
        body: JSON.stringify(payload),
      });

      const data = await upstream.text();

      return new Response(data, {
        status: upstream.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (e) {
      return jsonResponse({ error: `proxy نتونست وصل بشه: ${e.message}` }, 502);
    }
  },
};
