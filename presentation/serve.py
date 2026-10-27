"""Servidor estático da apresentação, isolado dos serviços e dados do portal."""
from __future__ import annotations

import argparse
from io import BytesIO
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.studio_urls import dashboard_url, studio_base

DIST = ROOT / "presentation/dist"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3003)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("A porta deve estar entre 1 e 65535.")
    prefix = os.environ.get("BLU_PRESENTATION_BASE_PATH")
    if prefix is None:
        prefix = urlsplit(dashboard_url(args.port)).path
    prefix = prefix.rstrip("/")

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs):
            super().__init__(*values, directory=str(DIST), **kwargs)

        def send_head(self):
            path = urlsplit(self.path).path
            if path == prefix or path.startswith(prefix + "/"):
                self.path = self.path[len(prefix):] or "/"
                path = urlsplit(self.path).path
            if path in ("/", "/index.html"):
                document = re.sub(
                    r'<base\s+href="\./"\s*/?>',
                    f'<base href="{prefix}/">',
                    (DIST / "index.html").read_text(),
                )
                portal_url = os.environ.get("BLU_PORTAL_PUBLIC_URL", "")
                if not portal_url:
                    try:
                        portal_url = dashboard_url(3001)
                    except ValueError:
                        portal_url = ""
                document = re.sub(
                    r'(<meta\s+name="blu-portal-url"\s+content=")[^"]*("\s*/?>)',
                    rf"\g<1>{portal_url}\g<2>",
                    document,
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
            # Evitar registar URLs ou outros conteúdos recebidos pelo servidor.
            pass

    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        try:
            print(f"Apresentação: {studio_base()}/ports/{args.port}/", flush=True)
        except ValueError:
            pass
        print(f"Endereço local: http://{args.host}:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
