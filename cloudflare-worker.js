/**
 * cloudflare-worker.js  (نسخه‌ی فقط-Gemini)
 *
 * این Worker دو کار می‌کنه:
 *   POST /proxy/google   -> چت با Gemini (با چرخش بین کلیدهای GOOGLE_KEY_1 تا GOOGLE_KEY_5)
 *   POST /proxy/weather  -> آب‌وهوا از Open-Meteo (از سرور Cloudflare، نه از گوشی کاربر)
 *
 * کلیدها باید توی Settings > Variables and Secrets به‌صورت Secret تعریف بشن.
 */

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// فقط این سایت‌ها اجازه‌ی استفاده‌ی مرورگری از Worker رو دارن
const ALLOWED_ORIGINS = [
  "https://leomahmood.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

function corsFor(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function getGoogleKeys(env) {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const k = env[`GOOGLE_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return keys;
}

async function handleGemini(payload, userKey, env, cors) {
  // اگه کاربر کلید شخصی خودش رو فرستاده، فقط از همون استفاده می‌کنیم؛ وگرنه از کلیدهای خود اپ
  const ownKey = typeof userKey === "string" ? userKey.trim() : "";
  if (ownKey && !/^[A-Za-z0-9._\-]{20,256}$/.test(ownKey)) {
    return json({ error: "فرمت کلید واردشده درست نیست. کلید رو دوباره از Google AI Studio کپی کن." }, 400, cors);
  }
  const usingOwnKey = ownKey.length > 0;
  const keys = usingOwnKey ? [ownKey] : getGoogleKeys(env);

  if (keys.length === 0) {
    return json({ error: "هیچ کلید Gemini‌ای روی سرور تنظیم نشده." }, 500, cors);
  }
  if (!payload || !Array.isArray(payload.contents)) {
    return json({ error: "فرمت پیام نامعتبره." }, 400, cors);
  }

  // فقط خود پیام‌ها رو به Gemini می‌فرستیم (نه هر چیزی که کلاینت بخواد)
  const body = JSON.stringify({ contents: payload.contents });

  // برای کلیدهای اپ از یه کلید تصادفی شروع می‌کنیم تا مصرف پخش بشه
  const start = usingOwnKey ? 0 : Math.floor(Math.random() * keys.length);
  let lastStatus = 0;
  let lastText = "";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    try {
      const upstream = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      });
      const data = await upstream.text();

      const invalidKey = upstream.status === 400 && /API_KEY_INVALID|API key not valid/i.test(data);
      const shouldRotate = [429, 401, 403].includes(upstream.status) || invalidKey;

      if (!shouldRotate) {
        return new Response(data, {
          status: upstream.status,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      lastStatus = upstream.status;
      lastText = data;

      // کلید شخصی کاربر: بدون رفتن سراغ کلیدهای اپ، خطا رو شفاف بهش بگو
      if (usingOwnKey) {
        return upstream.status === 429
          ? json({ error: "کلید خودت به سقف مصرف رسیده. کمی صبر کن یا کلید دیگه‌ای وارد کن." }, 429, cors)
          : json({ error: "کلیدی که وارد کردی معتبر نیست یا اجازه‌ی استفاده نداره." }, 400, cors);
      }
    } catch (e) {
      lastText = e.message;
      if (usingOwnKey) {
        return json({ error: "اتصال به Gemini برقرار نشد. دوباره امتحان کن." }, 502, cors);
      }
    }
  }

  if (lastStatus === 400) {
    return json(
      { error: "هیچ‌کدوم از کلیدهای Gemini معتبر نیستن. کلیدها رو توی Cloudflare (Secrets) دوباره وارد کن." },
      400,
      cors
    );
  }

  return json(
    {
      error: `همه‌ی کلیدهای Gemini موقتاً در دسترس نیستن (آخرین وضعیت: ${lastStatus}). چند دقیقه بعد دوباره امتحان کن، یا کلید شخصی خودت رو توی تنظیمات وارد کن.`,
      detail: lastText.slice(0, 300),
    },
    429,
    cors
  );
}

async function handleWeather(payload, cors) {
  const city = payload && typeof payload.city === "string" ? payload.city.trim() : "";
  if (!city || city.length > 80) {
    return json({ error: "اسم شهر نامعتبره." }, 400, cors);
  }

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fa&format=json`
    );
    const geo = await geoRes.json();
    if (!geo.results || geo.results.length === 0) {
      return json({ error: "شهری با این اسم پیدا نشد." }, 404, cors);
    }
    const place = geo.results[0];

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
    );
    const w = await wRes.json();

    return json(
      {
        place: { name: place.name, admin1: place.admin1, country: place.country },
        current: w.current,
        max: w.daily && w.daily.temperature_2m_max ? w.daily.temperature_2m_max[0] : null,
        min: w.daily && w.daily.temperature_2m_min ? w.daily.temperature_2m_min[0] : null,
      },
      200,
      cors
    );
  } catch (e) {
    return json({ error: `دریافت آب‌وهوا ناموفق بود: ${e.message}` }, 502, cors);
  }
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    const origin = request.headers.get("Origin");

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "دسترسی مجاز نیست." }, 403, cors);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "فقط POST پشتیبانی می‌شه." }, 405, cors);
    }

    const route = new URL(request.url).pathname.replace(/^\/proxy\//, "").replace(/\/$/, "");

    let payload, userKey;
    try {
      const raw = await request.text();
      if (raw.length > 200000) return json({ error: "درخواست خیلی بزرگه." }, 413, cors);
      const parsed = JSON.parse(raw);
      payload = parsed.payload;
      userKey = parsed.userKey;
    } catch (e) {
      return json({ error: "بدنه‌ی درخواست نامعتبره." }, 400, cors);
    }

    if (route === "google") return handleGemini(payload, userKey, env, cors);
    if (route === "weather") return handleWeather(payload, cors);
    return json({ error: `مسیر ناشناخته: ${route}` }, 404, cors);
  },
};
