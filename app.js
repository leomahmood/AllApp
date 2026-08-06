/* =========================================================
   app.js - نسخه اضطراری برای بازگرداندن چت و آب‌وهوا
   این نسخه فعلاً دکمه ارسال تصویر ندارد.
========================================================= */

// ---------- 1. گرفتن المان‌های HTML ----------
const chatArea = document.getElementById('chatArea');
const emptyState = document.getElementById('emptyState');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSwitcher = document.getElementById('modelSwitcher');

const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');
const settingsOverlay = document.getElementById('settingsOverlay');
const saveKeysBtn = document.getElementById('saveKeys');
const anthropicKeyInput = document.getElementById('anthropicKey');
const openaiKeyInput = document.getElementById('openaiKey');

const weatherBtn = document.getElementById('weatherBtn');
const weatherOverlay = document.getElementById('weatherOverlay');
const closeWeather = document.getElementById('closeWeather');
const citySearch = document.getElementById('citySearch');
const citySearchBtn = document.getElementById('citySearchBtn');
const cityChips = document.getElementById('cityChips');
const weatherResult = document.getElementById('weatherResult');

// ---------- 2. وضعیت برنامه ----------
let currentProvider = localStorage.getItem('lastProvider') || 'anthropic';

let conversations = {
  anthropic: [],
  openai: [],
  google: []
};

const PROXY_URL = 'https://flat-math-35b6.mahmoodgh20471.workers.dev';

// ---------- 3. تابع کمکی برای اتصال امن دکمه‌ها ----------
function addListener(el, eventName, fn) {
  if (el) {
    el.addEventListener(eventName, fn);
  }
}

// ---------- 4. کلیدها ----------
function getKeys() {
  return {
    anthropic: localStorage.getItem('key_anthropic') || '',
    openai: localStorage.getItem('key_openai') || '',
    google: localStorage.getItem('key_google') || ''
  };
}

function saveKeys() {
  if (anthropicKeyInput) {
    localStorage.setItem('key_anthropic', anthropicKeyInput.value.trim());
  }

  if (openaiKeyInput) {
    localStorage.setItem('key_openai', openaiKeyInput.value.trim());
  }

  updateStatusDots();
  closeSettingsPanel();
}

function loadKeysIntoInputs() {
  const keys = getKeys();

  if (anthropicKeyInput) anthropicKeyInput.value = keys.anthropic;
  if (openaiKeyInput) openaiKeyInput.value = keys.openai;
}

function updateStatusDots() {
  const keys = getKeys();

  document.querySelectorAll('.status-dot').forEach(dot => {
    const provider = dot.dataset.status;
    const isReady = provider === 'google' ? true : Boolean(keys[provider]);
    dot.classList.toggle('ready', isReady);
  });
}

// ---------- 5. پنل تنظیمات ----------
function openSettingsPanel() {
  loadKeysIntoInputs();

  if (settingsOverlay) {
    settingsOverlay.classList.add('open');
  }
}

function closeSettingsPanel() {
  if (settingsOverlay) {
    settingsOverlay.classList.remove('open');
  }
}

addListener(settingsBtn, 'click', openSettingsPanel);
addListener(closeSettings, 'click', closeSettingsPanel);
addListener(saveKeysBtn, 'click', saveKeys);

addListener(settingsOverlay, 'click', (e) => {
  if (e.target === settingsOverlay) {
    closeSettingsPanel();
  }
});

// ---------- 6. انتخاب مدل ----------
function setActiveProvider(provider) {
  currentProvider = provider;
  localStorage.setItem('lastProvider', provider);

  document.querySelectorAll('.preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });

  renderConversation();
}

addListener(modelSwitcher, 'click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;

  setActiveProvider(btn.dataset.provider);
});

// ---------- 7. نمایش چت ----------
function renderConversation() {
  if (!chatArea) return;

  chatArea.innerHTML = '';

  const msgs = conversations[currentProvider] || [];

  if (msgs.length === 0) {
    if (emptyState) {
      chatArea.appendChild(emptyState);
    }
    return;
  }

  msgs.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${msg.role}`;
    bubble.textContent = msg.content;
    chatArea.appendChild(bubble);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

function addMessage(role, content) {
  conversations[currentProvider].push({
    role,
    content
  });

  renderConversation();
}

function addLoadingBubble() {
  if (!chatArea) return;

  const bubble = document.createElement('div');
  bubble.className = 'msg loading';
  bubble.id = 'loadingBubble';
  bubble.textContent = 'در حال فکر کردن...';

  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removeLoadingBubble() {
  const bubble = document.getElementById('loadingBubble');

  if (bubble) {
    bubble.remove();
  }
}

function addErrorBubble(text) {
  if (!chatArea) return;

  const bubble = document.createElement('div');
  bubble.className = 'msg error';
  bubble.textContent = text;

  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ---------- 8. ارسال پیام ----------
async function handleSend() {
  if (!userInput) return;

  const text = userInput.value.trim();

  if (!text) return;

  const keys = getKeys();
  const needsClientKey = currentProvider !== 'google';

  if (needsClientKey && !keys[currentProvider]) {
    addErrorBubble('اول باید کلید API این مدل رو در تنظیمات وارد کنی.');
    return;
  }

  addMessage('user', text);

  userInput.value = '';
  userInput.style.height = 'auto';

  if (sendBtn) {
    sendBtn.disabled = true;
  }

  addLoadingBubble();

  try {
    let reply;

    if (currentProvider === 'anthropic') {
      reply = await callAnthropic(keys.anthropic);
    } else if (currentProvider === 'openai') {
      reply = await callOpenAI(keys.openai);
    } else if (currentProvider === 'google') {
      reply = await callGoogle(keys.google);
    }

    removeLoadingBubble();
    addMessage('assistant', reply);
  } catch (err) {
    removeLoadingBubble();
    addErrorBubble('خطا: ' + err.message);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }
}

addListener(sendBtn, 'click', handleSend);

addListener(userInput, 'keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

addListener(userInput, 'input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// ---------- 9. Proxy ----------
async function callProxy(provider, apiKey, payload) {
  let res;

  try {
    res = await fetch(`${PROXY_URL}/proxy/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey,
        payload
      })
    });
  } catch (e) {
    throw new Error('نمی‌تونم به proxy وصل بشم. اتصال اینترنتت رو چک کن.');
  }

  let data;

  try {
    data = await res.json();
  } catch (e) {
    throw new Error('جواب proxy معتبر نبود.');
  }

  if (!res.ok) {
    let detail = data.error;

    if (detail && typeof detail === 'object') {
      detail = detail.message || JSON.stringify(detail).slice(0, 200);
    }

    detail = detail || JSON.stringify(data).slice(0, 200);

    throw new Error(`${provider} (${res.status}): ${detail}`);
  }

  return data;
}

// ---------- 10. Claude ----------
async function callAnthropic(apiKey) {
  const history = conversations.anthropic.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  const data = await callProxy('anthropic', apiKey, {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: history
  });

  return (data.content || [])
    .map(block => block.text || '')
    .join('\n') || 'پاسخی از Claude دریافت نشد.';
}

// ---------- 11. GPT ----------
async function callOpenAI(apiKey) {
  const history = conversations.openai.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  const data = await callProxy('openai', apiKey, {
    model: 'gpt-4o-mini',
    messages: history,
    max_tokens: 1024
  });

  return data.choices?.[0]?.message?.content || 'پاسخی از GPT دریافت نشد.';
}

// ---------- 12. Gemini ----------
async function callGoogle(apiKey) {
  const history = conversations.google.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const data = await callProxy('google', apiKey, {
    contents: history
  });

  return data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('\n') || 'پاسخی از Gemini دریافت نشد.';
}

// ---------- 13. آب‌وهوا ----------
function openWeatherPanel() {
  if (weatherOverlay) {
    weatherOverlay.classList.add('open');
  }
}

function closeWeatherPanel() {
  if (weatherOverlay) {
    weatherOverlay.classList.remove('open');
  }
}

addListener(weatherBtn, 'click', openWeatherPanel);
addListener(closeWeather, 'click', closeWeatherPanel);

addListener(weatherOverlay, 'click', (e) => {
  if (e.target === weatherOverlay) {
    closeWeatherPanel();
  }
});

addListener(cityChips, 'click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  if (citySearch) {
    citySearch.value = chip.dataset.city;
  }

  fetchWeather(chip.dataset.city);
});

addListener(citySearchBtn, 'click', () => {
  const city = citySearch ? citySearch.value.trim() : '';

  if (city) {
    fetchWeather(city);
  }
});

addListener(citySearch, 'keydown', (e) => {
  if (e.key === 'Enter') {
    const city = citySearch ? citySearch.value.trim() : '';

    if (city) {
      fetchWeather(city);
    }
  }
});

const WEATHER_CODES = {
  0: ['آسمان صاف', '☀️'],
  1: ['کمی ابری', '🌤'],
  2: ['نیمه‌ابری', '⛅'],
  3: ['ابری', '☁️'],
  45: ['مه', '🌫'],
  48: ['مه یخ‌زده', '🌫'],
  51: ['نم‌نم باران', '🌦'],
  53: ['باران ملایم', '🌦'],
  55: ['باران متوسط', '🌧'],
  61: ['باران سبک', '🌧'],
  63: ['باران', '🌧'],
  65: ['باران شدید', '⛈'],
  71: ['برف سبک', '🌨'],
  73: ['برف', '❄️'],
  75: ['برف شدید', '❄️'],
  80: ['رگبار سبک', '🌦'],
  81: ['رگبار', '🌧'],
  82: ['رگبار شدید', '⛈'],
  95: ['رعدوبرق', '⛈'],
  96: ['رعدوبرق با تگرگ', '⛈'],
  99: ['رعدوبرق شدید', '⛈']
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || ['نامشخص', '🌡'];
}

async function fetchWeather(cityName) {
  if (!weatherResult) return;

  weatherResult.innerHTML = '<div class="weather-state">در حال جستجو...</div>';

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=fa&format=json`
    );

    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      weatherResult.innerHTML =
        '<div class="weather-state error">شهری با این اسم پیدا نشد.</div>';
      return;
    }

    const place = geoData.results[0];

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
    );

    const weatherData = await weatherRes.json();
    const current = weatherData.current;
    const [label, icon] = describeWeatherCode(current.weather_code);

    const displayName = [place.name, place.admin1, place.country]
      .filter(Boolean)
      .join('، ');

    weatherResult.innerHTML = `
      <div class="weather-card">
        <div class="city-name">${displayName}</div>
        <div class="weather-icon">${icon}</div>
        <div class="temp">${Math.round(current.temperature_2m)}°</div>
        <div class="condition">${label}</div>
        <div class="weather-meta">
          <span>💧 رطوبت ${current.relative_humidity_2m}%</span>
          <span>💨 باد ${Math.round(current.wind_speed_10m)} km/h</span>
        </div>
      </div>
    `;
  } catch (err) {
    weatherResult.innerHTML = `
      <div class="weather-state error">
        خطا در دریافت آب‌وهوا: ${err.message}
      </div>
    `;
  }
}

// ---------- 14. راه‌اندازی ----------
function init() {
  setActiveProvider(currentProvider);
  updateStatusDots();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // اگر Service Worker ثبت نشد، اپ همچنان کار می‌کند
    });
  }
}

init();
