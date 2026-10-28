# Resolve os URLs do Space atual e pede a abertura das interfaces, sem confundir esse pedido
# com saúde dos serviços.
"""Abre as cinco interfaces BLU na sessão de navegador do Code Editor."""
from __future__ import annotations

import argparse
import json
import time
import uuid
import os
from pathlib import Path
import signal
import subprocess
import webbrowser

try:
    from scripts.studio_urls import dashboard_url, studio_base, INTERFACES
except ModuleNotFoundError:
    from studio_urls import dashboard_url, studio_base, INTERFACES

BRIDGE = Path(__file__).resolve().parents[1] / "monitoring/runtime/code-editor-links"


def request_editor(action: str = "open", timeout: float = 10) -> bool:
    """Pedir à sessão ativa que resolva as portas, sem transportar URLs públicos."""
    if action not in {"open", "forward"}:
        raise ValueError("Ação desconhecida.")
    web = os.environ.get("SAGEMAKER_APP_TYPE") == "CodeEditor"
    if not (BRIDGE / ("session-2.json" if web else "session.json")).is_file():
        return False
    identity = uuid.uuid4().hex
    request = {"id": identity, "action": action, "at": int(time.time() * 1000)}
    if web:
        request["uiKind"] = 2
    temporary = BRIDGE / f"request-{identity}.tmp"
    temporary.write_text(json.dumps(request), encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, BRIDGE / "request.json")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = json.loads((BRIDGE / "response.json").read_text())
            if response.get("id") == identity:
                return response.get("ok") is True and (not web or response.get("uiKind") == 2)
        except (FileNotFoundError, ValueError):
            pass
        time.sleep(0.1)
    return False



DASHBOARDS = tuple((service["label"], service["port"], "/") for service in INTERFACES)


def urls() -> list[tuple[str, str]]:
    base = studio_base()
    return [(name, dashboard_url(port, path, base=base)) for name, port, path in DASHBOARDS]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print-only", action="store_true",
                        help="Mostrar os endereços sem abrir separadores.")
    parser.add_argument("--quiet", action="store_true",
                        help="Abrir sem escrever confirmação no terminal.")
    args = parser.parse_args()
    if not args.print_only and request_editor():
        if not args.quiet:
            print("Interfaces abertas através do encaminhamento nativo do Code Editor atual.")
        return 0
    targets = urls()
    if args.print_only:
        for name, url in targets:
            print(f"{name}: {url}")
        return 0

    if os.environ.get("SAGEMAKER_APP_TYPE") == "CodeEditor":
        for name, url in targets:
            print(f"{name}: {url}")
        print("A sessão web não confirmou a abertura. Abra o Code Editor do workspace no navegador AWS e execute BLU: Abrir interfaces deste workspace. A sessão SSH não regista as portas do proxy web.")
        # Código distinto: serviços não falharam; só falta uma sessão web ativa.
        return 3

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
