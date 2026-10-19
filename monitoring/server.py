"""Servidor privado do monitoring: apenas loopback, atrás do proxy HTTPS Studio."""
from __future__ import annotations

import argparse
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import html
import hmac
import json
import os
from pathlib import Path
import threading
from urllib.parse import parse_qs, urlsplit

from monitoring.collector import Collector
from monitoring.security import Security

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"


def make_server(port, security, collector, public_url, insecure_local=False):
    public = urlsplit(public_url)
    origin = f"{public.scheme}://{public.netloc}"
    prefix = public.path.rstrip("/")
    if public.query or public.fragment or public.username or public.password or not public.hostname:
        raise ValueError("URL público inválido.")
    if public.scheme != "https" and not (insecure_local and public.scheme == "http" and public.hostname == "127.0.0.1"):
        raise ValueError("O acesso público exige HTTPS; HTTP só é permitido no teste loopback.")
    cookie_name = "blu_monitor_test" if insecure_local else "__Secure-blu_monitor"

    class Handler(BaseHTTPRequestHandler):
        server_version = "BLU-Monitor"
        sys_version = ""

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *args):
            pass

        def reply(self, status, content=b"", kind="text/html; charset=utf-8", headers=None):
            if isinstance(content, str):
                content = content.encode()
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
            self.send_header("Connection", "close")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(content)
            self.close_connection = True

        def redirect(self, route, cookie=None):
            # O proxy Studio prefixa Locations iniciados por /; usar URL canónico completo.
            headers = {"Location": f"{origin}{prefix}{route}"}
            if cookie:
                headers["Set-Cookie"] = cookie
            self.reply(303, headers=headers)

        def token(self):
            try:
                cookie = SimpleCookie(self.headers.get("Cookie", ""))
                return cookie[cookie_name].value if cookie_name in cookie else ""
            except CookieError:
                return ""

        def route_path(self):
            path = urlsplit(self.path).path
            if prefix and (path == prefix or path.startswith(prefix + "/")):
                path = path[len(prefix):] or "/"
            return path

        def cookie(self, value, age=28800):
            return (f"{cookie_name}={value}; Path={prefix or ''}/; Max-Age={age}; HttpOnly; SameSite=Strict"
                    + ("" if insecure_local else "; Secure"))

        def template(self, name, csrf="", error=""):
            content = (STATIC / name).read_text()
            return content.replace("{{BASE}}", html.escape(prefix + "/", quote=True)).replace(
                "{{CSRF}}", html.escape(csrf, quote=True)).replace("{{ERROR}}", html.escape(error))

        def do_GET(self):
            path = self.route_path()
            session = security.session(self.token())
            if path == "/login":
                if session:
                    return self.redirect("/")
                return self.reply(200, self.template("login.html"))
            if path == "/style.css":
                return self.reply(200, (STATIC / "style.css").read_bytes(), "text/css; charset=utf-8")
            if not session:
                if path.startswith("/api/"):
                    return self.reply(401, '{"error":"authentication_required"}', "application/json")
                return self.redirect("/login")
            if path == "/":
                return self.reply(200, self.template("index.html", session["csrf"]))
            if path == "/app.js":
                return self.reply(200, (STATIC / "app.js").read_bytes(), "text/javascript; charset=utf-8")
            if path == "/api/status":
                return self.reply(200, json.dumps(collector.snapshot()), "application/json")
            return self.reply(404, "Não encontrado.")

        def do_POST(self):
            if self.headers.get("Origin") != origin:
                return self.reply(403, "Origem não autorizada.")
            if self.headers.get_content_type() != "application/x-www-form-urlencoded" or self.headers.get("Transfer-Encoding"):
                return self.reply(415, "Formato não suportado.")
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4096:
                    return self.reply(413, "Pedido inválido.")
                data = parse_qs(self.rfile.read(length).decode("utf-8"), max_num_fields=5)
            except (ValueError, UnicodeError):
                return self.reply(400, "Pedido inválido.")
            path = self.route_path()
            if path == "/login":
                token, status = security.login(data.get("username", [""])[0],
                                               data.get("password", [""])[0], self.client_address[0])
                if status != 200:
                    message = "Demasiadas tentativas. Aguarde cinco minutos." if status == 429 else "Credenciais inválidas."
                    return self.reply(status, self.template("login.html", error=message),
                                      headers={"Retry-After": "300"} if status == 429 else None)
                security.logout(self.token())
                return self.redirect("/", self.cookie(token))
            if path == "/logout":
                session = security.session(self.token())
                if not session:
                    return self.reply(401, "Sessão terminada.")
                if not hmac.compare_digest(data.get("csrf", [""])[0], session["csrf"]):
                    return self.reply(403, "Pedido inválido.")
                security.logout(self.token())
                return self.redirect("/login", self.cookie("", 0))
            return self.reply(404, "Não encontrado.")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3004)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Porta inválida.")
    os.umask(0o077)
    runtime = ROOT / "monitoring/runtime"
    credentials = runtime / "credentials.json"
    if not credentials.exists():
        parser.error("Executar primeiro: python -B -m monitoring.setup")
    config = json.loads((ROOT / "monitoring/config.json").read_text())
    base = json.loads((ROOT / "config/studio.json").read_text())["base_url"].rstrip("/")
    public_url = f"{base}/ports/{args.port}"
    collector = Collector(ROOT, runtime, config)
    security = Security(credentials)
    with make_server(args.port, security, collector, public_url) as server:
        thread = threading.Thread(target=collector.run, daemon=True)
        thread.start()
        print(f"Monitoring privado: {public_url}/", flush=True)
        print(f"Endereço local: http://127.0.0.1:{args.port}/", flush=True)
        print(f"No Code Editor, encaminhar a porta {args.port} no separador Ports/Portas.", flush=True)
        print("Acesso por login próprio. Escuta apenas em 127.0.0.1.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            collector.stop.set()
            thread.join(timeout=5)


if __name__ == "__main__":
    main()
