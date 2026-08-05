/* =========================================================
   app.js
   منطق اصلی اپلیکیشن. هر بخش با توضیح فارسی مشخص شده
   تا بتونی قدم به قدم بفهمی هر تیکه کد چیکار می‌کنه.
   ========================================================= */

// ---------- ۱. گرفتن ارجاع به المان‌های HTML ----------
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

// ---------- ۳. توابع کمکی برای ذخیره و خواندن کلیدها ----------
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
    bubble.textContent = msg.content;
    chatArea.appendChild(bubble);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

function addMessage(role, content) {
  conversations[currentProvider].push({ role, content });
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

// ---------- ۷. ارسال پیام و صدا زدن API درست ----------
async function handleSend() {
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
  const history = conversations.anthropic.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  const data = await callProxy('anthropic', apiKey, {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: history
  });

  return data.content.map(block => block.text || '').join('\n');
}

// --- OpenAI (GPT) ---
async function callOpenAI(apiKey) {
  const history = conversations.openai.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  const data = await callProxy('openai', apiKey, {
    model: 'gpt-4o-mini',
    messages: history
  });

  return data.choices[0].message.content;
}

// --- Google (Gemini) ---
async function callGoogle(apiKey) {
  const history = conversations.google.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const data = await callProxy('google', apiKey, { contents: history });

  return data.candidates[0].content.parts[0].text;
}

// ---------- ۹. راه‌اندازی اولیه هنگام باز شدن صفحه ----------
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
