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

from monitoring.backup import _hash

ROOT = Path(__file__).resolve().parents[1]
TREES = ("data", "warehouse", "exports")


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
            if path.is_file() and path.suffix in {".json", ".jsonl", ".sqlite", ".db"}:
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
    if manifest["version"] != 1:
        raise ValueError("Versão de backup desconhecida.")
    for item in manifest["files"]:
        relative = Path(item["path"])
        if not _allowed(relative):
            raise ValueError("Caminho inválido no backup.")
        source = snapshot / "files" / relative
        if (source.is_symlink() or not source.is_file()
                or source.stat().st_size != item["bytes"] or _hash(source) != item["sha256"]):
            raise ValueError("O backup não corresponde ao manifesto.")
    for directory in manifest["directories"]:
        if not _allowed(Path(directory)):
            raise ValueError("Diretório inválido no backup.")
    return manifest


def create(root: Path, store: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
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
            manifest = {"version": 1, "created_at": stamp,
                        "files": files, "directories": directories}
            (pending / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
            os.chmod(pending / "manifest.json", 0o600)
            _verify(pending)
            target = store / stamp
            os.replace(pending, target)
    return target


def restore_missing(root: Path, store: Path) -> int:
    """Recupera ausências; nunca recua ficheiros existentes para uma versão antiga."""
    with private_store(store):
        candidates = sorted(store.glob("*/manifest.json"), reverse=True)
        if not candidates:
            return 0
        snapshot = candidates[0].parent
        manifest = _verify(snapshot)
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
    args = parser.parse_args()
    store = backup_home(ROOT)
    if args.command == "create":
        print(f"Backup local verificado: {create(ROOT, store)}")
    else:
        print(f"Ficheiros recuperados do backup local: {restore_missing(ROOT, store)}")


if __name__ == "__main__":
    main()
