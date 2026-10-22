"""Backups privados fora do projeto para os comandos de arranque BLU."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from uuid import uuid4

from monitoring.backup import _hash

ROOT = Path(__file__).resolve().parents[1]
TREES = ("data", "warehouse", "exports")
PRIVATE_RUNTIME = {"credentials.json", "sessions.json", "editor-terminal.json"}


def backup_home(root: Path) -> Path:
    destination = Path(os.environ.get(
        "BLU_BACKUP_DIR", str(root.parent / "blu-system-backups" / root.name))).resolve()
    if destination == root or root in destination.parents:
        raise ValueError("O destino dos backups tem de ficar fora do projeto.")
    return destination


@contextmanager
def private_store(path: Path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)
    with (path / ".lock").open("a") as lock:
        os.chmod(path / ".lock", 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def _allowed(relative: Path) -> bool:
    return (not relative.is_absolute() and ".." not in relative.parts
            and bool(relative.parts)
            and (relative.parts[0] in TREES
                 or (relative.parts[:2] == ("monitoring", "runtime")
                     and len(relative.parts) == 3)))


def _sources(root: Path):
    for name in TREES:
        folder = root / name
        if folder.is_symlink():
            raise ValueError("Não é possível guardar uma árvore de dados simbólica.")
        if folder.exists():
            yield folder
            yield from sorted(folder.rglob("*"))
    runtime = root / "monitoring/runtime"
    if runtime.exists():
        # Apenas estado persistente; excluir processos, sessões, caches e logs.
        for path in sorted(runtime.iterdir()):
            if (path.is_file() and path.name not in PRIVATE_RUNTIME
                    and path.suffix in {".json", ".jsonl", ".sqlite", ".db"}):
                yield path


def _copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if source.suffix in {".sqlite", ".db"}:
        with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as database:
            with sqlite3.connect(target) as output:
                database.backup(output)
                if output.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("A cópia SQLite não passou a verificação.")
    else:
        shutil.copyfile(source, target)
    os.chmod(target, 0o600)


def _verify(snapshot: Path) -> dict:
    manifest = json.loads((snapshot / "manifest.json").read_text())
    if manifest["version"] not in {1, 2}:
        raise ValueError("Versão de backup desconhecida.")
    if manifest["version"] == 2:
        if (manifest.get("schema_version") != 2 or manifest.get("state") != "complete"
                or not manifest.get("backup_id") or not isinstance(manifest.get("resources"), list)):
            raise ValueError("Metadados do backup inválidos.")
    for item in manifest["files"]:
        relative = Path(item["path"])
        if not _allowed(relative):
            raise ValueError("Caminho inválido no backup.")
        source = snapshot / "files" / relative
        if (source.is_symlink() or not source.is_file()
                or source.stat().st_size != item["bytes"] or _hash(source) != item["sha256"]):
            raise ValueError("O backup não corresponde ao manifesto.")
        if source.suffix in {".sqlite", ".db"}:
            with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as database:
                if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("Uma base SQLite do backup não passou a verificação.")
    for directory in manifest["directories"]:
        if not _allowed(Path(directory)):
            raise ValueError("Diretório inválido no backup.")
    return manifest


def create(root: Path, store: Path, backup_id: str | None = None) -> Path:
    created_at = datetime.now(timezone.utc).isoformat()
    backup_id = backup_id or (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ-")
                              + uuid4().hex[:12])
    if not all(character.isalnum() or character in ".-_" for character in backup_id):
        raise ValueError("Identificador de backup inválido.")
    with private_store(store):
        with tempfile.TemporaryDirectory(prefix=".pending-", dir=store) as temporary:
            pending = Path(temporary)
            files, directories = [], []
            for source in _sources(root):
                relative = source.relative_to(root)
                if source.is_symlink():
                    raise ValueError("O backup não aceita ligações simbólicas nos dados.")
                if source.is_dir():
                    directories.append(relative.as_posix())
                elif source.is_file() and not source.name.endswith(("-wal", "-shm", "-journal")):
                    target = pending / "files" / relative
                    _copy(source, target)
                    files.append({"path": relative.as_posix(), "bytes": target.stat().st_size,
                                  "sha256": _hash(target)})
            resources = []
            for name in (*TREES, "monitoring/runtime"):
                prefix = f"{name}/"
                count = sum(item["path"] == name or item["path"].startswith(prefix)
                            for item in files)
                resources.append({"name": name, "schema_version": 1,
                                  "state": "present" if count else "absent",
                                  "file_count": count})
            manifest = {"version": 2, "schema_version": 2, "backup_id": backup_id,
                        "created_at": created_at, "state": "complete",
                        "resources": resources, "files": files, "directories": directories}
            (pending / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
            os.chmod(pending / "manifest.json", 0o600)
            _verify(pending)
            target = store / backup_id
            os.replace(pending, target)
    return target


def _record_rejected(root: Path, snapshot: Path, error: Exception) -> None:
    runtime = root / "monitoring/runtime/recovery"
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    log = runtime / "checkpoint-events.jsonl"
    event = {"at": datetime.now(timezone.utc).isoformat(), "operation": "restore",
             "backup_id": snapshot.name, "outcome": "rejected",
             "error_code": type(error).__name__}
    with log.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, separators=(",", ":")) + "\n")
    os.chmod(log, 0o600)


def _select_snapshot(root: Path, store: Path, backup_id: str | None = None) -> tuple[Path, dict] | None:
    if backup_id:
        if not all(character.isalnum() or character in ".-_" for character in backup_id):
            raise ValueError("Identificador de backup inválido.")
        snapshot = store / backup_id
        if not snapshot.is_dir():
            raise ValueError("O backup pedido não existe.")
        return snapshot, _verify(snapshot)
    candidates = sorted(store.glob("*/manifest.json"), reverse=True)
    for candidate in candidates:
        snapshot = candidate.parent
        try:
            return snapshot, _verify(snapshot)
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            _record_rejected(root, snapshot, error)
    if candidates:
        raise ValueError("Não existe um backup local válido para recuperação.")
    return None


def restore_missing(root: Path, store: Path, backup_id: str | None = None,
                    remote=True, s3_client=None) -> int:
    """Recupera ausências; nunca recua ficheiros existentes para uma versão antiga."""
    with private_store(store):
        from monitoring.s3_checkpoint import S3Config, download_latest
        config = S3Config.from_environment() if remote else None
        try:
            selected = _select_snapshot(root, store, backup_id)
        except ValueError:
            if not config:
                raise
            selected = None
        if selected is None and config:
            download_latest(root, store, config, backup_id, s3_client)
            selected = _select_snapshot(root, store, backup_id)
        if selected is None:
            return 0
        snapshot, manifest = selected
        # Validar todos os destinos antes da primeira escrita.
        relatives = [Path(item["path"]) for item in manifest["files"]]
        relatives += [Path(item) for item in manifest["directories"]]
        for relative in relatives:
            target = root / relative
            if any(parent.is_symlink() for parent in (target, *target.parents)):
                raise ValueError("O restauro não aceita destinos simbólicos.")
        for directory in manifest["directories"]:
            (root / directory).mkdir(parents=True, exist_ok=True)
        restored = 0
        for item in manifest["files"]:
            target = root / item["path"]
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".restore-", dir=target.parent) as temporary:
                staged = Path(temporary) / "file"
                shutil.copyfile(snapshot / "files" / item["path"], staged)
                os.chmod(staged, 0o600)
                # Criação exclusiva: uma escrita concorrente tem prioridade.
                try:
                    os.link(staged, target)
                    restored += 1
                except FileExistsError:
                    pass
        return restored


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("create", "restore-missing"))
    parser.add_argument("--backup-id", help="Restaurar ausências a partir desta versão específica.")
    parser.add_argument("--execution-id",
                        help="Usar este identificador único no backup criado pela execução.")
    parser.add_argument("--remote-required", action="store_true",
                        help="Falhar a criação se o upload S3 configurado não for confirmado.")
    args = parser.parse_args()
    store = backup_home(ROOT)
    if args.command == "create":
        snapshot = create(ROOT, store, args.execution_id)
        print(f"Backup local verificado: {snapshot}")
        from monitoring.s3_checkpoint import S3Config, upload
        config = S3Config.from_environment()
        if config:
            try:
                result = upload(ROOT, snapshot, config)
                print(f"Backup S3 verificado: {result['backup_id']}")
            except Exception:
                if args.remote_required:
                    raise
                print("Aviso: cópia local válida; upload S3 falhou.")
    else:
        print(f"Ficheiros recuperados do backup local: {restore_missing(ROOT, store, args.backup_id)}")


if __name__ == "__main__":
    main()
