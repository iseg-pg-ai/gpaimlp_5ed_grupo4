"""Cópias locais verificáveis e ensaios de restauro isolados."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_backup(root: Path, runtime: Path) -> Path:
    backups = runtime / "backups"
    backups.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    target, temporary = backups / stamp, backups / f".{stamp}.tmp"
    temporary.mkdir(mode=0o700)
    catalog = root / "data/portal/catalog.sqlite"
    if catalog.exists():
        destination = temporary / "catalog.sqlite"
        with sqlite3.connect(catalog) as source, sqlite3.connect(destination) as output:
            source.backup(output)
    for name, source in (("warehouse", root / "warehouse"),
                         ("itineraries", root / "exports/itineraries")):
        if source.exists():
            shutil.copytree(source, temporary / name)
    artifacts = []
    for path in sorted(item for item in temporary.rglob("*") if item.is_file()):
        artifacts.append({"path": path.relative_to(temporary).as_posix(),
                          "bytes": path.stat().st_size, "sha256": _hash(path)})
    manifest = {"backup_id": stamp, "created_at": datetime.now(timezone.utc).isoformat(),
                "state": "complete", "artifacts": artifacts}
    (temporary / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(temporary, target)
    return target


def verify_backup(path: Path, runtime: Path) -> dict:
    manifest = json.loads((path / "manifest.json").read_text())
    with tempfile.TemporaryDirectory() as directory:
        restored = Path(directory)
        for artifact in manifest["artifacts"]:
            source = path / artifact["path"]
            if not source.is_file() or source.stat().st_size != artifact["bytes"] or _hash(source) != artifact["sha256"]:
                raise ValueError("A cópia não corresponde ao manifesto.")
            destination = restored / artifact["path"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        database = restored / "catalog.sqlite"
        if database.exists():
            with sqlite3.connect(database) as connection:
                if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("A cópia SQLite não passou a verificação.")
    evidence = {"checked_at": datetime.now(timezone.utc).isoformat(), "outcome": "passed",
                "backup_id": manifest["backup_id"], "backup_created_at": manifest["created_at"],
                "artifact_count": len(manifest["artifacts"])}
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = runtime / "restore-evidence.tmp"
    temporary.write_text(json.dumps(evidence, indent=2) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, runtime / "restore-evidence.json")
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("create-and-verify")
    verify = commands.add_parser("verify")
    verify.add_argument("path", type=Path)
    args = parser.parse_args()
    runtime = ROOT / "monitoring/runtime"
    path = create_backup(ROOT, runtime) if args.command == "create-and-verify" else args.path.resolve()
    evidence = verify_backup(path, runtime)
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
