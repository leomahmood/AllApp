/* =========================================================
   app.js
   منطق اصلی اپلیکیشن. هر بخش با توضیح فارسی مشخص شده
   تا بتونی قدم به قدم بفهمی هر تیکه کد چیکار می‌کنه.
   ========================================================= */

// ---------- ۱. گرفتن ارجاع به المان‌های HTML ----------
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const imagePreviewBar = document.getElementById('imagePreviewBar');
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

// المان‌های پنل آب‌وهوا
const weatherBtn = document.getElementById('weatherBtn');
const weatherOverlay = document.getElementById('weatherOverlay');
const closeWeather = document.getElementById('closeWeather');
const citySearch = document.getElementById('citySearch');
const citySearchBtn = document.getElementById('citySearchBtn');
const cityChips = document.getElementById('cityChips');
const weatherResult = document.getElementById('weatherResult');

// ---------- ۲. وضعیت برنامه (State) ----------
// provider فعلی که کاربر انتخاب کرده. پیش‌فرض: anthropic
let currentProvider = localStorage.getItem('lastProvider') || 'anthropic';

// تاریخچه‌ی پیام‌ها برای هر provider جدا نگه داشته می‌شه
// چون هر مدل باید فقط مکالمه‌ی خودش رو به یاد داشته باشه
let conversations = {
  anthropic: [],
  openai: [],
  google: []
};
let pendingImage = null;

// ---------- ۳. توابع کمکی برای ذخیره و خواندن کلیدها ----------
function compressImage(file, maxDimension = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('فایل انتخابی تصویر نیست.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // اگر عکس بزرگ بود، کوچکش کن
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // برای کم‌حجم شدن، PNG را هم معمولاً JPEG می‌کنیم
        const mimeType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg';

        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1];

        resolve({
          dataUrl,
          base64,
          mimeType
        });
      };

      img.onerror = () => reject(new Error('نمی‌توانم تصویر را بخوانم.'));
      img.src = reader.result;
    };

    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود.'));
    reader.readAsDataURL(file);
  });
}
function showImagePreview(imageData) {
  imagePreviewBar.hidden = false;

  imagePreviewBar.innerHTML = `
    <div class="image-preview-item">
      <img src="${imageData.dataUrl}" alt="پیش‌نمایش تصویر">
      <button id="removeImageBtn" type="button">✕</button>
    </div>
  `;

  document.getElementById('removeImageBtn').addEventListener('click', clearPendingImage);
}

function clearPendingImage() {
  pendingImage = null;
  imagePreviewBar.hidden = true;
  imagePreviewBar.innerHTML = '';
}
function getKeys() {
  return {
    anthropic: localStorage.getItem('key_anthropic') || '',
    openai: localStorage.getItem('key_openai') || '',
    google: localStorage.getItem('key_google') || ''
  };
}

function saveKeys() {
  localStorage.setItem('key_anthropic', anthropicKeyInput.value.trim());
  localStorage.setItem('key_openai', openaiKeyInput.value.trim());
  updateStatusDots();
  closeSettingsPanel();
}

// وقتی صفحه بالا میاد، کلیدهای ذخیره‌شده رو داخل اینپوت‌ها بریز
function loadKeysIntoInputs() {
  const keys = getKeys();
  anthropicKeyInput.value = keys.anthropic;
  openaiKeyInput.value = keys.openai;
}

// دایره‌ی سبز کنار اسم هر مدل رو روشن/خاموش کن بسته به اینکه کلید داره یا نه
function updateStatusDots() {
  const keys = getKeys();
  document.querySelectorAll('.status-dot').forEach(dot => {
    const provider = dot.dataset.status;
    const isReady = provider === 'google' ? true : Boolean(keys[provider]);
    dot.classList.toggle('ready', isReady);
  });
}

// ---------- ۴. مدیریت پنل تنظیمات (باز/بسته کردن) ----------
function openSettingsPanel() {
  loadKeysIntoInputs();
  settingsOverlay.classList.add('open');
}

function closeSettingsPanel() {
  settingsOverlay.classList.remove('open');
}

settingsBtn.addEventListener('click', openSettingsPanel);
closeSettings.addEventListener('click', closeSettingsPanel);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettingsPanel();
});
saveKeysBtn.addEventListener('click', saveKeys);

// ---------- ۵. سوییچ کردن بین مدل‌ها ----------
function setActiveProvider(provider) {
  currentProvider = provider;
  localStorage.setItem('lastProvider', provider);

  document.querySelectorAll('.preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });

  renderConversation();
}

modelSwitcher.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  setActiveProvider(btn.dataset.provider);
});

// ---------- ۶. نمایش پیام‌ها در صفحه ----------
function renderConversation() {
  chatArea.innerHTML = '';

  const msgs = conversations[currentProvider];

  if (msgs.length === 0) {
    chatArea.appendChild(emptyState);
    return;
  }

  msgs.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${msg.role}`;

    if (msg.image && msg.image.dataUrl) {
      const img = document.createElement('img');
      img.src = msg.image.dataUrl;
      img.className = 'msg-image';
      bubble.appendChild(img);
    }

    if (msg.content) {
      const textNode = document.createElement('div');
      textNode.textContent = msg.content;
      bubble.appendChild(textNode);
    }

    chatArea.appendChild(bubble);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

  msgs.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${msg.role}`;
    bubble.textContent = msg.content;
    chatArea.appendChild(bubble);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

function addMessage(role, content, image = null) {
  conversations[currentProvider].push({
    role,
    content,
    image
  });

  renderConversation();
}

function addLoadingBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'msg loading';
  bubble.id = 'loadingBubble';
  bubble.textContent = 'در حال فکر کردن...';
  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removeLoadingBubble() {
  const bubble = document.getElementById('loadingBubble');
  if (bubble) bubble.remove();
}

function addErrorBubble(text) {
  const bubble = document.createElement('div');
  bubble.className = 'msg error';
  bubble.textContent = text;
  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}
attachBtn.addEventListener('click', () => {
  imageInput.click();
});

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];

  if (!file) return;

  try {
    const compressed = await compressImage(file, 1280, 0.85);
    pendingImage = compressed;
    showImagePreview(compressed);
  } catch (err) {
    alert('خطا در آماده‌سازی تصویر: ' + err.message);
  }

  imageInput.value = '';
});

// ---------- ۷. ارسال پیام و صدا زدن API درست ----------
async function handleSend() {
  let text = userInput.value.trim();

  const hasImage = Boolean(pendingImage && pendingImage.base64);

  if (!text && !hasImage) return;

  if (!text && hasImage) {
    text = 'این تصویر را بررسی کن.';
  }

  const keys = getKeys();
  const needsClientKey = currentProvider !== 'google';

  if (needsClientKey && !keys[currentProvider]) {
    addErrorBubble('اول باید کلید API این مدل رو در تنظیمات وارد کنی.');
    return;
  }

  const imageToSend = hasImage ? pendingImage : null;

  addMessage('user', text, imageToSend);

  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;

  clearPendingImage();

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
    sendBtn.disabled = false;
  }
}

  addMessage('user', text);
  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;
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

// بزرگ شدن خودکار جعبه‌ی متن وقتی چند خطی می‌شه
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// ---------- ۸. تابع‌های اختصاصی هر ارائه‌دهنده‌ی هوش مصنوعی ----------
// همه از یک سرور واسط آنلاین (Cloudflare Worker) عبور می‌کنن تا مشکل CORS مرورگر حل بشه.
// این یعنی دیگه لازم نیست هیچ ترمینالی روی کامپیوترت باز باشه.
const PROXY_URL = 'https://flat-math-35b6.mahmoodgh20471.workers.dev';

// تابع مشترک: پیام رو به آدرس /proxy/<provider> می‌فرسته
async function callProxy(provider, apiKey, payload) {
  let res;
  try {
    res = await fetch(`${PROXY_URL}/proxy/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, payload })
    });
  } catch (e) {
    throw new Error('نمی‌تونم به proxy وصل بشم. اتصال اینترنتت رو چک کن.');
  }

  const data = await res.json();
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

// --- Anthropic (Claude) ---
async function callAnthropic(apiKey) {
  const history = conversations.anthropic.map((msg, index, arr) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    // برای اینکه حجم درخواست خیلی زیاد نشود، فقط آخرین پیام کاربر را با عکس می‌فرستیم
    const isLastUserMessage = index === arr.length - 1 && msg.role === 'user';

    if (isLastUserMessage && msg.image && msg.image.base64) {
      return {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: msg.image.mimeType,
              data: msg.image.base64
            }
          },
          {
            type: 'text',
            text: msg.content || 'این تصویر را بررسی کن.'
          }
        ]
      };
    }

    return {
      role,
      content: msg.content
    };
  });

  const data = await callProxy('anthropic', apiKey, {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: history
  });

  return data.content.map(block => block.text || '').join('\n');
}

  const data = await callProxy('anthropic', apiKey, {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: history
  });

  return data.content.map(block => block.text || '').join('\n');
}

// --- OpenAI (GPT) ---
async function callOpenAI(apiKey) {
  const history = conversations.openai.map((msg, index, arr) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    const isLastUserMessage = index === arr.length - 1 && msg.role === 'user';

    if (isLastUserMessage && msg.image && msg.image.dataUrl) {
      return {
        role,
        content: [
          {
            type: 'text',
            text: msg.content || 'این تصویر را بررسی کن.'
          },
          {
            type: 'image_url',
            image_url: {
              url: msg.image.dataUrl
            }
          }
        ]
      };
    }

    return {
      role,
      content: msg.content
    };
  });

  const data = await callProxy('openai', apiKey, {
    model: 'gpt-4o-mini',
    messages: history,
    max_tokens: 1024
  });

  return data.choices[0].message.content;
}

  const data = await callProxy('openai', apiKey, {
    model: 'gpt-4o-mini',
    messages: history
  });

  return data.choices[0].message.content;
}

// --- Google (Gemini) ---
async function callGoogle(apiKey) {
  const history = conversations.google.map((msg, index, arr) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    const isLastUserMessage = index === arr.length - 1 && msg.role === 'user';

    if (isLastUserMessage && msg.image && msg.image.base64) {
      return {
        role,
        parts: [
          {
            text: msg.content || 'این تصویر را بررسی کن.'
          },
          {
            inline_data: {
              mime_type: msg.image.mimeType,
              data: msg.image.base64
            }
          }
        ]
      };
    }

    return {
      role,
      parts: [
        {
          text: msg.content || ''
        }
      ]
    };
  });

  const data = await callProxy('google', apiKey, {
    contents: history
  });

  return data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('\n') || 'پاسخی از Gemini دریافت نشد.';
}

  const data = await callProxy('google', apiKey, { contents: history });

  return data.candidates[0].content.parts[0].text;
}

// ---------- ۱۰. بخش آب‌وهوا (سرویس رایگان Open-Meteo، بدون نیاز به کلید) ----------

function openWeatherPanel() {
  weatherOverlay.classList.add('open');
}

function closeWeatherPanel() {
  weatherOverlay.classList.remove('open');
}

weatherBtn.addEventListener('click', openWeatherPanel);
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
  const city = citySearch.value.trim();
  if (city) fetchWeather(city);
});

citySearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const city = citySearch.value.trim();
    if (city) fetchWeather(city);
  }
});

// نگاشت کد وضعیت هوای Open-Meteo به توضیح فارسی و ایموجی
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
  99: ['رعدوبرق شدید', '⛈'],
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || ['نامشخص', '🌡'];
}

async function fetchWeather(cityName) {
  weatherResult.innerHTML = '<div class="weather-state">در حال جستجو...</div>';

  try {
    // قدم ۱: تبدیل اسم شهر به مختصات از طریق Worker خودت
    const geoRes = await fetch(
      `${PROXY_URL}/weather/geocode?name=${encodeURIComponent(cityName)}`
    );

    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      weatherResult.innerHTML =
        '<div class="weather-state error">شهری با این اسم پیدا نشد.</div>';
      return;
    }

    const place = geoData.results[0];

    // قدم ۲: گرفتن آب‌وهوا از طریق Worker خودت
    const weatherRes = await fetch(
      `${PROXY_URL}/weather/current?latitude=${place.latitude}&longitude=${place.longitude}`
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

// ---------- ۱۱. راه‌اندازی اولیه هنگام باز شدن صفحه ----------
function init() {
  setActiveProvider(currentProvider);
  updateStatusDots();

  // ثبت Service Worker برای قابلیت نصب و کارکرد آفلاین
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // اگر ثبت نشد، مشکلی نیست، اپ همچنان کار می‌کنه فقط بدون کش آفلاین
    });
  }
}

init();
