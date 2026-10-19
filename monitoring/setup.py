"""Preparar credenciais sem enviar segredos para o Git ou argumentos CLI."""
import argparse
import getpass
import os
from pathlib import Path
import secrets

from monitoring.security import save_credentials

RUNTIME = Path(__file__).resolve().parent / "runtime"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", action="store_true", help="Gerar acesso inicial num ficheiro privado local")
    args = parser.parse_args()
    credentials = RUNTIME / "credentials.json"
    if args.generate and credentials.exists():
        parser.error("Já existem credenciais. Usar o modo interativo para as substituir.")
    username = "admin" if args.generate else input("Utilizador: ").strip()
    password = secrets.token_urlsafe(24) if args.generate else getpass.getpass("Palavra-passe (12–128 caracteres): ")
    if not args.generate and password != getpass.getpass("Confirmar palavra-passe: "):
        parser.error("As palavras-passe não coincidem.")
    save_credentials(credentials, username, password)
    initial = RUNTIME / "initial-password.txt"
    if args.generate:
        with os.fdopen(os.open(initial, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            file.write(f"Utilizador: {username}\nPalavra-passe: {password}\n")
        print(f"Acesso inicial guardado apenas em: {initial}")
    else:
        initial.unlink(missing_ok=True)
        print("Administrador criado/recuperado; outras contas preservadas. Reiniciar o monitoring.")


if __name__ == "__main__":
    main()
