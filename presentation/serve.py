"""Serve o pitch estático sem depender do portal, de credenciais ou de descoberta AWS."""
from __future__ import annotations

import argparse
from html import escape
from io import BytesIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parent / "dist"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3003)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("A porta deve estar entre 1 e 65535.")
    configured_prefix = os.environ.get("BLU_PRESENTATION_BASE_PATH", "").rstrip("/")
    if configured_prefix and (not configured_prefix.startswith("/") or configured_prefix.startswith("//")):
        parser.error("O prefixo da apresentação deve ser um caminho local iniciado por /.")

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs):
            super().__init__(*values, directory=str(DIST), **kwargs)

        def send_head(self):
            path = urlsplit(self.path).path
            # O prefixo vem do pedido do proxy; servir localmente não exige acesso à AWS.
            proxy = re.match(r"^(.*?/ports/\d+)(?=/|$)", path)
            prefix = configured_prefix or (proxy.group(1) if proxy else "")
            if prefix and (path == prefix or path.startswith(prefix + "/")):
                self.path = self.path[len(prefix):] or "/"
                path = urlsplit(self.path).path
            if path in ("/", "/index.html"):
                document = re.sub(
                    r'<base\s+href="\./"\s*/?>',
                    lambda _: f'<base href="{escape(prefix, quote=True)}/">' if prefix else '<base href="./">',
                    (DIST / "index.html").read_text(),
                )
                content = document.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return BytesIO(content)
            return super().send_head()

        def list_directory(self, path):
            self.send_error(404)
            return None

        def log_message(self, format, *values):
            # Os pedidos do visitante não são guardados em logs da apresentação.
            pass

    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        print(f"Pitch BLU: http://{args.host}:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
