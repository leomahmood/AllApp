/* =========================================================
   app.js  (نسخه‌ی فقط-Gemini)
   چت با Gemini + آب‌وهوا. همه‌ی درخواست‌ها از Cloudflare Worker رد می‌شن
   و هیچ کلیدی روی دستگاه کاربر نیست.
   ========================================================= */

'use strict';

// آدرس Worker شما
const PROXY_URL = 'https://flat-math-35b6.mahmoodgh20471.workers.dev';

// ---------- پاک‌سازی بقایای نسخه‌های قبلی ----------
// سرویس‌ورکر و کش قدیمی (که باعث می‌شد آپدیت‌ها دیر برسن) رو حذف می‌کنه
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
if (window.caches) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
// کلیدهای API که نسخه‌های قبلی توی مرورگر ذخیره کرده بودن رو هم پاک کن
try {
  ['key_anthropic', 'key_openai', 'key_google', 'lastProvider'].forEach((k) => localStorage.removeItem(k));
} catch (e) {}

// ---------- المان‌ها ----------
const $ = (id) => document.getElementById(id);
const chatArea = $('chatArea');
const userInput = $('userInput');
const sendBtn = $('sendBtn');
const clearBtn = $('clearBtn');
const weatherBtn = $('weatherBtn');
const weatherOverlay = $('weatherOverlay');
const closeWeather = $('closeWeather');
const citySearch = $('citySearch');
const citySearchBtn = $('citySearchBtn');
const cityChips = $('cityChips');
const weatherResult = $('weatherResult');
const settingsBtn = $('settingsBtn');
const settingsOverlay = $('settingsOverlay');
const closeSettings = $('closeSettings');
const userKeyInput = $('userKeyInput');
const saveKeyBtn = $('saveKeyBtn');
const removeKeyBtn = $('removeKeyBtn');
const keyStatus = $('keyStatus');
const pillText = $('pillText');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- کلید شخصی Gemini (اختیاری) ----------
const USER_KEY_STORAGE = 'gemini_user_key';

function getUserKey() {
  try { return (localStorage.getItem(USER_KEY_STORAGE) || '').trim(); } catch (e) { return ''; }
}

function updateKeyUi() {
  const has = getUserKey().length > 0;
  pillText.textContent = has ? 'Gemini · کلید شخصی' : 'Gemini';
  keyStatus.textContent = has ? 'کلید شخصی فعاله.' : 'الان از کلیدهای خود اپ استفاده می‌شه.';
}

settingsBtn.addEventListener('click', () => {
  userKeyInput.value = '';
  updateKeyUi();
  settingsOverlay.classList.add('open');
});
closeSettings.addEventListener('click', () => settingsOverlay.classList.remove('open'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

saveKeyBtn.addEventListener('click', () => {
  const k = userKeyInput.value.trim();
  if (!k) { keyStatus.textContent = 'اول کلید رو وارد کن.'; return; }
  try { localStorage.setItem(USER_KEY_STORAGE, k); } catch (e) {
    keyStatus.textContent = 'ذخیره‌ی کلید توی این مرورگر ممکن نشد.';
    return;
  }
  userKeyInput.value = '';
  updateKeyUi();
});

removeKeyBtn.addEventListener('click', () => {
  try { localStorage.removeItem(USER_KEY_STORAGE); } catch (e) {}
  userKeyInput.value = '';
  updateKeyUi();
});

// ---------- ارتباط با Worker ----------
async function callProxy(route, payload) {
  let res;
  const body = { payload };
  if (route === 'google') {
    const k = getUserKey();
    if (k) body.userKey = k; // کلید شخصی کاربر (اگه گذاشته باشه)
  }

  try {
    res = await fetch(`${PROXY_URL}/proxy/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('اتصال به سرور برقرار نشد. اینترنتت رو چک کن.');
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* جواب JSON نبود */ }

  if (!res.ok) {
    let detail = data && data.error;
    if (detail && typeof detail === 'object') detail = detail.message || JSON.stringify(detail);
    throw new Error(detail || `خطای سرور (${res.status})`);
  }
  return data;
}

// ---------- چت ----------
let history = []; // [{ role: 'user' | 'assistant', content: '...' }]

function renderChat() {
  chatArea.innerHTML = '';

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'سلام! هر سوالی داری بپرس.';
    chatArea.appendChild(empty);
    return;
  }

  history.forEach((m) => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${m.role}`;
    bubble.textContent = m.content;
    chatArea.appendChild(bubble);
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addTransientBubble(className, text) {
  const bubble = document.createElement('div');
  bubble.className = `msg ${className}`;
  bubble.textContent = text;
  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sendBtn.disabled) return;

  history.push({ role: 'user', content: text });
  userInput.value = '';
  userInput.style.height = 'auto';
  renderChat();

  sendBtn.disabled = true;
  const loading = addTransientBubble('loading', 'در حال فکر کردن...');

  try {
    const data = await callProxy('google', {
      contents: history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    });

    const parts = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts;
    const reply = parts ? parts.map((p) => p.text || '').join('') : '';

    if (!reply) throw new Error('Gemini جوابی برنگردوند. سوالت رو طور دیگه‌ای بپرس.');

    history.push({ role: 'assistant', content: reply });
    renderChat();
  } catch (err) {
    // پیام ناموفق رو از تاریخچه بردار و توی کادر برگردون تا بتونی دوباره بفرستی
    history.pop();
    renderChat();
    userInput.value = text;
    addTransientBubble('error', err.message);
  } finally {
    loading.remove();
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});
clearBtn.addEventListener('click', () => {
  history = [];
  renderChat();
});

// ---------- آب‌وهوا ----------
const openWeather = () => weatherOverlay.classList.add('open');
const closeWeatherPanel = () => weatherOverlay.classList.remove('open');

weatherBtn.addEventListener('click', openWeather);
closeWeather.addEventListener('click', closeWeatherPanel);
weatherOverlay.addEventListener('click', (e) => {
  if (e.target === weatherOverlay) closeWeatherPanel();
});

cityChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  citySearch.value = chip.dataset.city;
  fetchWeather(chip.dataset.city);
});
citySearchBtn.addEventListener('click', () => {
  if (citySearch.value.trim()) fetchWeather(citySearch.value.trim());
});
citySearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && citySearch.value.trim()) fetchWeather(citySearch.value.trim());
});

// کد وضعیت هوا -> [توضیح فارسی، آیکون روز، آیکون شب]
const WEATHER_CODES = {
  0:  ['آسمان صاف', '☀️', '🌙'],
  1:  ['تقریباً صاف', '🌤️', '🌙'],
  2:  ['نیمه‌ابری', '⛅', '☁️'],
  3:  ['ابری', '☁️', '☁️'],
  45: ['مه', '🌫️', '🌫️'],
  48: ['مه یخ‌زده', '🌫️', '🌫️'],
  51: ['نم‌نم باران', '🌦️', '🌧️'],
  53: ['نم‌نم باران', '🌦️', '🌧️'],
  55: ['نم‌نم شدید', '🌧️', '🌧️'],
  56: ['نم‌نم یخ‌زده', '🌧️', '🌧️'],
  57: ['نم‌نم یخ‌زده', '🌧️', '🌧️'],
  61: ['باران سبک', '🌦️', '🌧️'],
  63: ['باران', '🌧️', '🌧️'],
  65: ['باران شدید', '🌧️', '🌧️'],
  66: ['باران یخ‌زده', '🌧️', '🌧️'],
  67: ['باران یخ‌زده شدید', '🌧️', '🌧️'],
  71: ['برف سبک', '🌨️', '🌨️'],
  73: ['برف', '❄️', '❄️'],
  75: ['برف شدید', '❄️', '❄️'],
  77: ['دانه‌های برف', '🌨️', '🌨️'],
  80: ['رگبار سبک', '🌦️', '🌧️'],
  81: ['رگبار', '🌧️', '🌧️'],
  82: ['رگبار شدید', '⛈️', '⛈️'],
  85: ['بارش برف', '🌨️', '🌨️'],
  86: ['بارش برف شدید', '❄️', '❄️'],
  95: ['رعدوبرق', '⛈️', '⛈️'],
  96: ['رعدوبرق با تگرگ', '⛈️', '⛈️'],
  99: ['رعدوبرق شدید با تگرگ', '⛈️', '⛈️']
};

function describeWeather(code, isDay) {
  const entry = WEATHER_CODES[code] || ['نامشخص', '🌡️', '🌡️'];
  return { label: entry[0], icon: isDay ? entry[1] : entry[2] };
}

async function fetchWeather(city) {
  weatherResult.innerHTML = '<div class="weather-state">در حال دریافت...</div>';

  try {
    const data = await callProxy('weather', { city });
    const c = data.current;
    const { label, icon } = describeWeather(c.weather_code, c.is_day === 1);
    const name = [data.place.name, data.place.admin1, data.place.country].filter(Boolean).join('، ');
    const range = (data.max != null && data.min != null)
      ? `<div class="range">↑ ${Math.round(data.max)}°  ↓ ${Math.round(data.min)}°</div>`
      : '';

    weatherResult.innerHTML = `
      <div class="weather-card">
        <div class="city-name">${escapeHtml(name)}</div>
        <div class="weather-icon">${icon}</div>
        <div class="temp">${Math.round(c.temperature_2m)}°C</div>
        <div class="condition">${escapeHtml(label)}</div>
        ${range}
        <div class="weather-meta">
          <span>💧 رطوبت ${Math.round(c.relative_humidity_2m)}٪</span>
          <span>💨 باد ${Math.round(c.wind_speed_10m)} km/h</span>
        </div>
      </div>`;
  } catch (err) {
    weatherResult.innerHTML = `<div class="weather-state error">${escapeHtml(err.message)}</div>`;
  }
}

// ---------- شروع ----------
renderChat();
updateKeyUi();
