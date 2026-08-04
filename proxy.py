"""
proxy.py
یه سرور واسط (proxy) خیلی ساده که فقط با پایتون خالص کار می‌کنه
(هیچ نصب اضافه‌ای لازم نداره، چون از کتابخانه‌های استاندارد پایتون استفاده می‌کنه).

کارش چیه؟
مرورگر مستقیم نمی‌تونه به api.anthropic.com یا generativelanguage.googleapis.com
یا api.openai.com وصل بشه (به‌خاطر CORS). پس مرورگر به‌جاش با این سرور
(که روی خود سیستم خودت، روی پورت 8787 اجرا می‌شه) صحبت می‌کنه، و این سرور
درخواست رو به‌جای مرورگر به شرکت هوش مصنوعی می‌فرسته و جواب رو برمی‌گردونه.

اجرا:
    python proxy.py
"""

import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8787

# آدرس واقعی هر سرویس + نحوه‌ی ساختن هدرها
PROVIDERS = {
    "anthropic": {
        "url": lambda api_key: "https://api.anthropic.com/v1/messages",
        "headers": lambda api_key: {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    },
    "openai": {
        "url": lambda api_key: "https://api.openai.com/v1/chat/completions",
        "headers": lambda api_key: {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    },
    "google": {
        "url": lambda api_key: (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.0-flash:generateContent?key={api_key}"
        ),
        "headers": lambda api_key: {
            "Content-Type": "application/json",
        },
    },
}


class ProxyHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        # این هدرها به مرورگر اجازه می‌دن با این سرور محلی صحبت کنه
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        # مرورگر قبل از درخواست اصلی، یه درخواست "پیش‌بررسی" می‌فرسته
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_POST(self):
        # مسیر درخواست باید شبیه /proxy/anthropic یا /proxy/openai یا /proxy/google باشه
        provider_name = self.path.replace("/proxy/", "").strip("/")
        provider = PROVIDERS.get(provider_name)

        if not provider:
            self._send_json(404, {"error": f"provider ناشناخته: {provider_name}"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            api_key = body["apiKey"]
            payload = body["payload"]
        except Exception as e:
            self._send_json(400, {"error": f"بدنه‌ی درخواست نامعتبره: {e}"})
            return

        target_url = provider["url"](api_key)
        target_headers = provider["headers"](api_key)

        req = urllib.request.Request(
            target_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=target_headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                data = resp.read()
        except urllib.error.HTTPError as e:
            # حتی وقتی سرویس خطا می‌ده، همون خطا رو دقیق به مرورگر برگردون
            status = e.code
            data = e.read()
        except Exception as e:
            self._send_json(502, {"error": f"proxy نتونست وصل بشه: {e}"})
            return

        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, status, obj):
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def log_message(self, format, *args):
        # لاگ‌های ساده و خوانا توی ترمینال
        print(f"[proxy] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", PORT), ProxyHandler)
    print(f"🟢 Proxy server در حال اجرا روی http://localhost:{PORT}")
    print("این پنجره رو باز نگه دار. برای توقف: Ctrl+C")
    server.serve_forever()
