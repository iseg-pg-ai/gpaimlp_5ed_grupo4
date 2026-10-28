# Exige autenticação administrativa para autorizar os comandos de recuperação do workspace.
"""Confirma interativamente um administrador antes da recuperação do sistema."""
from __future__ import annotations

import getpass
from pathlib import Path
import sys

from monitoring.security import Security

ROOT = Path(__file__).resolve().parents[1]


def authorize_admin(credentials: Path, username: str, password: str) -> bool:
    """Valida uma conta ativa e exige explicitamente o perfil administrativo."""
    try:
        security = Security(credentials)
        token, status = security.login(username, password, "local-recovery")
    except (OSError, ValueError, KeyError, TypeError):
        return False
    if status != 200 or not token:
        return False
    session = security.session(token)
    security.logout(token)
    return bool(session and session["role"] == "admin")


def main() -> None:
    credentials = ROOT / "monitoring/runtime/credentials.json"
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise SystemExit("A autenticação exige um terminal interativo.")
    if not credentials.is_file():
        raise SystemExit(
            "Não existem credenciais de monitoring. Criar primeiro um administrador."
        )
    print("Autenticação administrativa necessária")
    username = input("Utilizador: ").strip()
    password = getpass.getpass("Palavra-passe: ")
    if not authorize_admin(credentials, username, password):
        raise SystemExit("Acesso recusado: credenciais inválidas ou perfil sem permissão.")
    print("Acesso administrativo confirmado.\n")


if __name__ == "__main__":
    main()
