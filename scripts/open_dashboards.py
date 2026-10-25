"""Abre as quatro interfaces BLU na sessão de navegador do Code Editor."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import subprocess
import webbrowser

from studio_urls import dashboard_url


DASHBOARDS = (
    ("Portal", 3001, "/"),
    ("Apresentação", 3003, "/"),
    ("Monitoring", 3004, "/"),
    ("Observatório", 8501, "/"),
)


def urls() -> list[tuple[str, str]]:
    return [(name, dashboard_url(port, path)) for name, port, path in DASHBOARDS]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print-only", action="store_true",
                        help="Mostrar os endereços sem abrir separadores.")
    parser.add_argument("--quiet", action="store_true",
                        help="Abrir sem escrever confirmação no terminal.")
    args = parser.parse_args()
    targets = urls()
    if args.print_only:
        for name, url in targets:
            print(f"{name}: {url}")
        return 0

    helper = os.environ.get("BROWSER", "")
    if helper and Path(helper).is_file():
        for _, url in targets:
            # O helper entrega o pedido ao cliente do Code Editor, mas pode manter-se
            # ligado ao IPC até o separador responder. Dar tempo para entregar o
            # pedido e fechar o grupo evita acumular processos auxiliares.
            process = subprocess.Popen(
                [helper, url],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            try:
                return_code = process.wait(timeout=1)
                if return_code:
                    raise subprocess.CalledProcessError(return_code, [helper, url])
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
    else:
        opened = [webbrowser.open_new_tab(url) for _, url in targets]
        if not all(opened):
            for name, url in targets:
                print(f"{name}: {url}")
            print("Abertura automática indisponível; use os endereços acima.")
            return 0
    if not args.quiet:
        print("Dashboards abertos no navegador associado à sessão.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
