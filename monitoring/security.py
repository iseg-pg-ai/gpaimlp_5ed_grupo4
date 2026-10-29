# Gere credenciais, sessões e permissões próprias do Monitoring, separadas da identidade da
# role AWS.
"""Contas locais, autorização e sessões do painel de operações."""
from __future__ import annotations

from copy import deepcopy
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time

ITERATIONS = 600_000


# Derivar o registo de autenticação sem conservar a palavra-passe em texto simples.
def password_record(password):
    if not 12 <= len(password) <= 128:
        raise ValueError("A palavra-passe deve ter entre 12 e 128 caracteres.")
    salt = secrets.token_hex(32)
    return {"salt": salt, "iterations": ITERATIONS,
            "hash": hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()}


def username_key(username):
    return username.casefold()


def validate_username(username):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,39}", username):
        raise ValueError("Usar 3–40 caracteres: letras sem acentos, números, ponto, hífen ou underscore.")


def read_users(path):
    value = json.loads(path.read_text())
    if value.get("version") == 2:
        return value["users"]
    # A conta legada mantém nome, sal e hash; não é necessário conhecer a palavra-passe.
    return {username_key(value["username"]): {**value, "role": "admin", "enabled": True}}


def write_users(path, users):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    temporary = path.with_name(".credentials-" + secrets.token_hex(12) + ".tmp")
    try:
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            json.dump({"version": 2, "users": users}, file)
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save_credentials(path: Path, username: str, password: str):
    """Recuperação CLI: criar/recuperar um administrador sem apagar outras contas."""
    validate_username(username)
    users = read_users(path) if path.exists() else {}
    users[username_key(username)] = {"username": username, "role": "admin", "enabled": True,
                                    **password_record(password)}
    write_users(path, users)


# Reunir sessões, permissões e gestão de contas num único ponto de validação.
class Security:
    def __init__(self, path: Path, clock=time.monotonic):
        self.path = path
        self.users = read_users(path)
        self.clock = clock
        self.lock = threading.RLock()
        self.sessions = {}
        self.failures = {}

    def login(self, username: str, password: str, address: str):
        with self.lock:
            now = self.clock()
            self.failures = {ip: times for ip, times in self.failures.items()
                             if times and now - times[-1] < 300}
            attempts = [t for t in self.failures.get(address, []) if now - t < 300]
            if len(attempts) >= 5:
                return None, 429
            user = self.users.get(username_key(username))
            # Trabalho equivalente para um nome desconhecido, sem revelar se a conta existe.
            record = user or next(iter(self.users.values()))
            value = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(record["salt"]),
                                       record["iterations"]).hex()
            valid = hmac.compare_digest(value, record["hash"])
            if not user or not user["enabled"] or not valid or len(password) > 128:
                self.failures[address] = attempts + [now]
                return None, 401
            self.failures.pop(address, None)
            self.sessions = {key: item for key, item in self.sessions.items()
                             if now - item["created"] < 28800 and now - item["used"] < 1800}
            if len(self.sessions) >= 100:
                self.sessions.pop(next(iter(self.sessions)))
            token = secrets.token_urlsafe(48)
            self.sessions[self.key(token)] = {"created": now, "used": now,
                                             "username": user["username"], "csrf": secrets.token_urlsafe(32)}
            return token, 200

    @staticmethod
    def key(token):
        return hashlib.sha256(token.encode()).hexdigest()

    # Revalidar a conta e os prazos em cada acesso, não apenas durante o login.
    def session(self, token):
        with self.lock:
            key = self.key(token)
            item = self.sessions.get(key)
            now = self.clock()
            user = self.users.get(username_key(item["username"])) if item else None
            if (not item or not user or not user["enabled"] or now - item["created"] >= 28800
                    or now - item["used"] >= 1800):
                self.sessions.pop(key, None)
                return None
            item["used"] = now
            return {**item, "role": user["role"]}

    def logout(self, token):
        with self.lock:
            self.sessions.pop(self.key(token), None)

    def admin_session(self, token):
        session = self.session(token)
        if not session or session["role"] != "admin":
            raise PermissionError("Apenas administradores podem gerir contas.")
        return session

    def list_users(self, token):
        with self.lock:
            self.admin_session(token)
            return [{field: user[field] for field in ("username", "role", "enabled")}
                    for user in sorted(self.users.values(), key=lambda user: user["username"].casefold())]

    # Preparar as alterações numa cópia e preservar pelo menos um administrador ativo.
    def manage(self, token, action, fields):
        with self.lock:
            actor = self.admin_session(token)
            key = username_key(fields.get("username", ""))
            users = deepcopy(self.users)
            if action == "create":
                username = fields.get("username", "")
                validate_username(username)
                if key in users:
                    raise ValueError("Já existe uma conta com esse nome.")
                if len(users) >= 100:
                    raise ValueError("Atingido o limite de 100 contas locais.")
                role = fields.get("role")
                if role not in ("admin", "viewer"):
                    raise ValueError("Perfil inválido.")
                if fields.get("password") != fields.get("password_confirm"):
                    raise ValueError("As palavras-passe não coincidem.")
                users[key] = {"username": username, "role": role, "enabled": True,
                              **password_record(fields.get("password", ""))}
            else:
                if key not in users:
                    raise ValueError("Conta não encontrada. Atualize a página.")
                user = users[key]
                if action == "password":
                    if fields.get("password") != fields.get("password_confirm"):
                        raise ValueError("As palavras-passe não coincidem.")
                    user.update(password_record(fields.get("password", "")))
                elif action == "update":
                    role, enabled = fields.get("role"), fields.get("enabled")
                    if role not in ("admin", "viewer") or enabled not in ("true", "false"):
                        raise ValueError("Perfil ou estado inválido.")
                    if key == username_key(actor["username"]) and enabled == "false":
                        raise ValueError("Não pode desativar a conta que está a utilizar.")
                    user.update(role=role, enabled=enabled == "true")
                elif action == "delete":
                    if key == username_key(actor["username"]):
                        raise ValueError("Não pode remover a conta que está a utilizar.")
                    if fields.get("confirm") != "delete":
                        raise ValueError("Confirme a remoção da conta.")
                    del users[key]
                else:
                    raise ValueError("Operação inválida.")
            if not any(user["enabled"] and user["role"] == "admin" for user in users.values()):
                raise ValueError("Tem de existir pelo menos um administrador ativo.")
            # Só publicar o estado em memória e revogar sessões depois da persistência.
            write_users(self.path, users)
            self.users = users
            if action != "create":
                self.sessions = {session_key: item for session_key, item in self.sessions.items()
                                 if username_key(item["username"]) != key}
            if key == "admin" and action in ("password", "delete"):
                try:
                    (self.path.parent / "initial-password.txt").unlink(missing_ok=True)
                except OSError:
                    pass  # A palavra-passe inicial já foi invalidada pela alteração guardada.
