"""Credenciais locais e sessões do painel de operações."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time

ITERATIONS = 600_000


def save_credentials(path: Path, username: str, password: str):
    if not username or len(username) > 80 or len(password) < 12:
        raise ValueError("Utilizador obrigatório e palavra-passe com pelo menos 12 caracteres.")
    salt = secrets.token_hex(32)
    value = {"username": username, "salt": salt, "iterations": ITERATIONS,
             "hash": hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()}
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    temporary = path.with_suffix(".tmp")
    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as file:
        json.dump(value, file)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


class Security:
    def __init__(self, path: Path, clock=time.monotonic):
        self.credentials = json.loads(path.read_text())
        self.clock = clock
        self.lock = threading.RLock()
        self.sessions = {}
        self.failures = {}

    def login(self, username: str, password: str, address: str):
        with self.lock:
            now = self.clock()
            # O proxy Studio partilha IP: não confiar em X-Forwarded-For recebido.
            self.failures = {ip: times for ip, times in self.failures.items()
                             if times and now - times[-1] < 300}
            attempts = [t for t in self.failures.get(address, []) if now - t < 300]
            if len(attempts) >= 5:
                return None, 429
            value = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                       bytes.fromhex(self.credentials["salt"]),
                                       self.credentials["iterations"]).hex()
            valid = hmac.compare_digest(value, self.credentials["hash"])
            valid = hmac.compare_digest(username.encode(), self.credentials["username"].encode()) and valid
            if not valid:
                self.failures[address] = attempts + [now]
                return None, 401
            self.failures.pop(address, None)
            self.sessions = {key: item for key, item in self.sessions.items()
                             if now - item["created"] < 28800 and now - item["used"] < 1800}
            if len(self.sessions) >= 20:
                self.sessions.pop(next(iter(self.sessions)))
            token = secrets.token_urlsafe(48)
            self.sessions[self.key(token)] = {"created": now, "used": now,
                                             "csrf": secrets.token_urlsafe(32)}
            return token, 200

    @staticmethod
    def key(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def session(self, token):
        with self.lock:
            key = self.key(token)
            item = self.sessions.get(key)
            now = self.clock()
            if not item or now - item["created"] >= 28800 or now - item["used"] >= 1800:
                self.sessions.pop(key, None)
                return None
            item["used"] = now
            return dict(item)

    def logout(self, token):
        with self.lock:
            self.sessions.pop(self.key(token), None)
