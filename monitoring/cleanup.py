"""Limpeza conservadora de artefactos regeneráveis e backups excedentes."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import threading


class CleanupManager:
    def __init__(self, root: Path, runtime: Path, config: dict):
        self.root = root.resolve()
        self.runtime = runtime.resolve()
        self.config = config.get("cleanup", {})
        self.status_path = self.runtime / "cleanup-status.json"
        self.lock = threading.Lock()

    def _status(self) -> dict:
        try:
            saved = json.loads(self.status_path.read_text())
            return {"last_run_at": saved.get("last_run_at"),
                    "last_trigger": saved.get("last_trigger"),
                    "freed_bytes": int(saved.get("freed_bytes", 0)),
                    "removed_entries": int(saved.get("removed_entries", 0)),
                    "outcome": saved.get("outcome", "unknown")}
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return {"last_run_at": None, "last_trigger": None, "freed_bytes": 0,
                    "removed_entries": 0, "outcome": "never"}

    def public_status(self) -> dict:
        result = self._status()
        result.update(enabled=bool(self.config.get("enabled", False)),
                      trigger_disk_pct=self.config.get("trigger_disk_pct"))
        return result

    def _size(self, path: Path) -> int:
        if path.is_symlink() or path.is_file():
            return path.lstat().st_size
        total = 0
        for item in path.rglob("*"):
            try:
                if item.is_file() or item.is_symlink():
                    total += item.lstat().st_size
            except OSError:
                continue
        return total

    def _remove(self, path: Path) -> int:
        size = self._size(path)
        if path.is_symlink() or path.is_file():
            path.unlink(missing_ok=True)
        elif path.exists():
            shutil.rmtree(path)
        return size

    def _candidates(self, now: datetime) -> list[Path]:
        candidates = [self.root / "dmc-workspace/.next/cache", self.root / ".pytest_cache"]
        scan_roots = ["monitoring", "src", "tests", "dashboard", "presentation", "portal", "translations"]
        for relative in scan_roots:
            base = self.root / relative
            if base.exists():
                candidates.extend(base.rglob("__pycache__"))
        backups = self.runtime / "backups"
        keep = max(1, int(self.config.get("backup_retention_count", 5)))
        minimum_age = timedelta(hours=max(24, int(self.config.get("backup_min_age_hours", 168))))
        completed = []
        if backups.exists():
            for path in backups.iterdir():
                if path.name.startswith(".") and path.is_dir():
                    modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
                    if now - modified >= timedelta(hours=24):
                        candidates.append(path)
                elif path.is_dir() and (path / "manifest.json").is_file():
                    try:
                        manifest = json.loads((path / "manifest.json").read_text())
                        created = datetime.fromisoformat(manifest["created_at"])
                        if manifest["state"] == "complete" and created.tzinfo:
                            completed.append((created, path))
                    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                        continue
        completed.sort(reverse=True)
        candidates.extend(path for created, path in completed[keep:] if now - created >= minimum_age)
        return candidates

    def run(self, trigger: str) -> dict:
        if trigger not in {"automatic", "manual"}:
            raise ValueError("Origem de limpeza inválida.")
        with self.lock:
            freed = removed = 0
            outcome = "passed"
            try:
                for path in self._candidates(datetime.now(timezone.utc)):
                    if path.exists() or path.is_symlink():
                        freed += self._remove(path)
                        removed += 1
            except OSError:
                outcome = "partial"
            status = {"last_run_at": datetime.now(timezone.utc).isoformat(),
                      "last_trigger": trigger, "freed_bytes": freed,
                      "removed_entries": removed, "outcome": outcome}
            self.runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary = self.status_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(status, separators=(",", ":")))
            os.chmod(temporary, 0o600)
            os.replace(temporary, self.status_path)
            return self.public_status()

    def maybe_run(self, disk_used_pct: float) -> dict:
        if not self.config.get("enabled", False):
            return self.public_status()
        threshold = float(self.config.get("trigger_disk_pct", 85))
        status = self._status()
        if disk_used_pct < threshold:
            return self.public_status()
        if status["last_run_at"]:
            last = datetime.fromisoformat(status["last_run_at"])
            interval = timedelta(hours=max(1, int(self.config.get("minimum_interval_hours", 24))))
            if datetime.now(timezone.utc) - last < interval:
                return self.public_status()
        return self.run("automatic")
