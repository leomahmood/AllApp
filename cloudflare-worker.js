/**
 * cloudflare-worker.js — نسخه ۲.۰.۰
 *
 * مسیرها:
 *   GET  /health         -> وضعیت سرور (برای «تست اتصال» داخل اپ)
 *   POST /proxy/google   -> چت با Gemini
 *   POST /proxy/weather  -> آب‌وهوا (Open-Meteo، از سرور Cloudflare)
 *
 * کلیدهای Gemini خود اپ باید توی Settings > Variables and Secrets
 * به‌صورت Secret با اسم‌های GOOGLE_KEY_1 تا GOOGLE_KEY_5 تعریف بشن.
 * کاربر می‌تونه کلید شخصی خودش رو هم بفرسته؛ اون‌وقت فقط همون استفاده می‌شه.
 */

const VERSION = "2.0.0";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// فقط این آدرس‌ها اجازه‌ی استفاده‌ی مرورگری از Worker رو دارن
const ALLOWED_ORIGINS = [
  "https://leomahmood.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const MAX_BODY_CHARS = 200000;
const MAX_MESSAGES = 60;
const MAX_PARTS = 4;
const MAX_TEXT_CHARS = 20000;
const GEMINI_TIMEOUT_MS = 20000;
const OVERALL_DEADLINE_MS = 40000;
const WEATHER_TIMEOUT_MS = 8000;
const USER_KEY_PATTERN = /^[A-Za-z0-9._\-]{20,256}$/;

/* ---------------- ابزارهای کمکی ---------------- */

function corsFor(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

// درخواست با محدودیت زمانی؛ بدنه‌ی جواب هم داخل همون محدودیت خونده می‌شه
async function fetchText(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } finally {
    clearTimeout(timer);
  }
}

function getGoogleKeys(env) {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const k = env && env[`GOOGLE_KEY_${i}`];
    if (typeof k === "string" && k.trim()) keys.push(k.trim());
  }
  return keys;
}

// فقط فیلدهای مجاز پیام رو نگه می‌داره (نه هر چیزی که کلاینت بفرسته)
function sanitizeContents(contents) {
  if (!Array.isArray(contents) || contents.length === 0 || contents.length > MAX_MESSAGES) return null;
  const out = [];
  for (const c of contents) {
    if (!c || (c.role !== "user" && c.role !== "model")) return null;
    if (!Array.isArray(c.parts) || c.parts.length === 0 || c.parts.length > MAX_PARTS) return null;
    const parts = [];
    for (const p of c.parts) {
      if (!p || typeof p.text !== "string" || p.text.length === 0 || p.text.length > MAX_TEXT_CHARS) return null;
      parts.push({ text: p.text });
    }
    out.push({ role: c.role, parts });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

function extractReply(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: "جواب نامعتبر از Gemini رسید." };
  }
  const cand = data && data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  const reply = Array.isArray(parts)
    ? parts.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("")
    : "";
  if (reply) return { reply };
  const why = (data && data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason);
  return { error: why ? `Gemini جوابی نداد (${why}). سوالت رو طور دیگه‌ای بپرس.` : "Gemini جوابی برنگردوند." };
}

function replyJson(reply, cors) {
  // `candidates` فقط برای سازگاری با نسخه‌های قدیمی‌تر اپ نگه داشته شده
  return json({ reply, candidates: [{ content: { parts: [{ text: reply }] } }] }, 200, cors);
}

/* ---------------- چت با Gemini ---------------- */

async function handleGemini(payload, userKey, env, cors) {
  const ownKey = typeof userKey === "string" ? userKey.trim() : "";
  if (ownKey && !USER_KEY_PATTERN.test(ownKey)) {
    return json({ error: "فرمت کلید واردشده درست نیست. کلید رو دوباره از Google AI Studio کپی کن." }, 400, cors);
  }
  const usingOwnKey = ownKey.length > 0;
  const keys = usingOwnKey ? [ownKey] : getGoogleKeys(env);

  if (keys.length === 0) {
    return json({ error: "هیچ کلید Gemini‌ای روی سرور تنظیم نشده." }, 503, cors);
  }

  const contents = sanitizeContents(payload && payload.contents);
  if (!contents) {
    return json({ error: "فرمت پیام نامعتبره." }, 400, cors);
  }
  const body = JSON.stringify({ contents });

  // برای کلیدهای اپ از یه کلید تصادفی شروع می‌کنیم تا مصرف پخش بشه
  const start = usingOwnKey ? 0 : Math.floor(Math.random() * keys.length);
  const startedAt = Date.now();
  let attempts = 0;
  let invalidCount = 0;
  let limitCount = 0;

  for (let i = 0; i < keys.length; i++) {
    if (i > 0 && Date.now() - startedAt > OVERALL_DEADLINE_MS) break;
    const key = keys[(start + i) % keys.length];
    attempts++;

    let r;
    try {
      r = await fetchText(
        GEMINI_URL,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body },
        GEMINI_TIMEOUT_MS
      );
    } catch (e) {
      if (usingOwnKey) {
        return json({ error: "اتصال به Gemini برقرار نشد یا دیر شد. دوباره امتحان کن." }, 504, cors);
      }
      continue;
    }

    const invalid = r.status === 400 && /API_KEY_INVALID|API key not valid/i.test(r.text);
    if (r.status === 429) {
      limitCount++;
    } else if (r.status === 401 || r.status === 403 || invalid) {
      invalidCount++;
    } else {
      // جواب «عادی» (موفق یا خطای غیرمرتبط با کلید)
      if (r.ok) {
        const out = extractReply(r.text);
        return out.reply ? replyJson(out.reply, cors) : json({ error: out.error }, 422, cors);
      }
      let detail = "";
      try {
        detail = JSON.parse(r.text).error.message || "";
      } catch (e) {
        /* بدنه JSON نبود */
      }
      if (r.status === 503) {
        return json({ error: "Gemini الان شلوغه. چند لحظه بعد دوباره امتحان کن." }, 503, cors);
      }
      return json({ error: `Gemini خطا داد (${r.status})${detail ? ": " + detail.slice(0, 160) : ""}` }, 502, cors);
    }

    // به اینجا برسیم یعنی این کلید سقف مصرف داره یا نامعتبره
    if (usingOwnKey) {
      return limitCount > 0
        ? json({ error: "کلید خودت به سقف مصرف رسیده. کمی صبر کن یا کلید دیگه‌ای وارد کن." }, 429, cors)
        : json({ error: "کلیدی که وارد کردی معتبر نیست یا اجازه‌ی استفاده نداره." }, 400, cors);
    }
  }

  // همه‌ی کلیدهای اپ ناموفق بودن
  if (attempts > 0 && invalidCount === attempts) {
    return json({ error: "کلیدهای Gemini روی سرور معتبر نیستن. صاحب اپ باید Secretها رو دوباره وارد کنه." }, 503, cors);
  }
  if (limitCount > 0) {
    return json(
      { error: "همه‌ی کلیدهای اپ موقتاً به سقف مصرف رسیدن. چند دقیقه بعد دوباره امتحان کن، یا کلید شخصی خودت رو توی تنظیمات وارد کن." },
      429,
      cors
    );
  }
  return json({ error: "اتصال به Gemini برقرار نشد. دوباره امتحان کن." }, 502, cors);
}

/* ---------------- آب‌وهوا ---------------- */

async function handleWeather(payload, cors) {
  const city = payload && typeof payload.city === "string" ? payload.city.trim() : "";
  if (!city || city.length > 80) {
    return json({ error: "اسم شهر نامعتبره." }, 400, cors);
  }

  try {
    const geoRes = await fetchText(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fa&format=json`,
      { method: "GET" },
      WEATHER_TIMEOUT_MS
    );
    if (!geoRes.ok) return json({ error: "سرویس جستجوی شهر جواب نداد. چند لحظه بعد امتحان کن." }, 502, cors);

    const geo = JSON.parse(geoRes.text);
    if (!geo.results || geo.results.length === 0) {
      return json({ error: "شهری با این اسم پیدا نشد." }, 404, cors);
    }
    const place = geo.results[0];

    const wRes = await fetchText(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(place.latitude)}&longitude=${encodeURIComponent(place.longitude)}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
      { method: "GET" },
      WEATHER_TIMEOUT_MS
    );
    if (!wRes.ok) return json({ error: "سرویس آب‌وهوا جواب نداد. چند لحظه بعد امتحان کن." }, 502, cors);

    const w = JSON.parse(wRes.text);
    if (!w.current) return json({ error: "اطلاعات آب‌وهوا کامل نبود." }, 502, cors);

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
    return json({ error: "دریافت آب‌وهوا ناموفق بود. دوباره امتحان کن." }, 502, cors);
  }
}

/* ---------------- نقطه‌ی ورود ---------------- */

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "دسترسی مجاز نیست." }, 403, cors);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, service: "gemini-hub", version: VERSION, geminiKeys: getGoogleKeys(env).length }, 200, cors);
    }
    if (request.method !== "POST") {
      return json({ error: "فقط POST پشتیبانی می‌شه." }, 405, cors);
    }

    const route = url.pathname.replace(/^\/proxy\//, "").replace(/\/$/, "");

    let payload, userKey;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return json({ error: "درخواست خیلی بزرگه." }, 413, cors);
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
