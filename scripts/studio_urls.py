"""Endereços públicos dos dashboards a partir da base Studio configurada."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

CONFIG = Path(__file__).resolve().parents[1] / "config/studio.json"


def studio_base() -> str:
    value = json.loads(CONFIG.read_text())["base_url"].rstrip("/")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path != "/codeeditor/default"):
        raise ValueError("base_url deve ser uma origem HTTPS seguida de /codeeditor/default.")
    return value


def dashboard_url(port: int, path: str = "") -> str:
    if not 1 <= port <= 65535:
        raise ValueError("Porta inválida.")
    if path and (not path.startswith("/") or path.startswith("//")
                 or "?" in path or "#" in path or ".." in path.split("/")):
        raise ValueError("Usar um caminho local iniciado por /, sem parâmetros ou fragmentos.")
    return f"{studio_base()}/ports/{port}{path or '/'}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", action="store_true")
    parser.add_argument("--port", type=int)
    parser.add_argument("--path", default="")
    args = parser.parse_args()
    if args.origin:
        parsed = urlsplit(studio_base())
        print(f"{parsed.scheme}://{parsed.netloc}")
    elif args.port is not None:
        print(dashboard_url(args.port, args.path))
    else:
        for name, port in [("Portal BLU", 3001), ("Dashboard analítico", 8501),
                           ("Apresentação interativa", 3003)]:
            print(f"{name}: {dashboard_url(port)}")


if __name__ == "__main__":
    main()
