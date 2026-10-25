"""Estado operacional versionado no S3 e materialização numa cache local."""
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
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1


def _client():
    import boto3
    return boto3.client("s3")


def _configuration() -> tuple[str, str]:
    bucket = os.environ.get("BLU_DATA_S3_BUCKET", "").strip()
    environment = os.environ.get("BLU_ENVIRONMENT", "development").strip()
    if not bucket:
        raise ValueError("BLU_DATA_S3_BUCKET não está configurado.")
    if not environment or not all(char.isalnum() or char in "-_." for char in environment):
        raise ValueError("BLU_ENVIRONMENT é inválido.")
    return bucket, environment


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sqlite_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as connection, sqlite3.connect(destination) as output:
        connection.backup(output)
    with sqlite3.connect(destination) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError(f"A cópia SQLite de {source.name} não passou a verificação.")


def _stage(catalog: Path, exports: Path, pending: Path, destination: Path) -> None:
    if catalog.is_file():
        _sqlite_copy(catalog, destination / "data/portal/catalog.sqlite")
    history = exports / "history.sqlite"
    if history.is_file():
        _sqlite_copy(history, destination / "exports/itineraries/history.sqlite")
    if exports.is_dir():
        for source in sorted(exports.rglob("*")):
            relative = source.relative_to(exports)
            if source.is_file() and relative.as_posix() not in {
                "history.sqlite", "history.sqlite-wal", "history.sqlite-shm"
            }:
                target = destination / "exports/itineraries" / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
    if pending.is_dir():
        shutil.copytree(pending, destination / "exports/portal-persistence", dirs_exist_ok=True)


def _put(client, bucket: str, key: str, body, *, metadata: dict[str, str], immutable=True):
    arguments = dict(Bucket=bucket, Key=key, Body=body,
                     ServerSideEncryption="AES256", Metadata=metadata)
    if immutable:
        arguments["IfNoneMatch"] = "*"
    client.put_object(**arguments)


def publish(catalog: Path, exports: Path, pending: Path, bucket: str,
            environment: str, client=None, release_id: str | None = None) -> dict:
    """Publica uma snapshot completa e muda o apontador apenas no fim."""
    client = client or _client()
    release_id = release_id or (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ-") + uuid4().hex[:12]
    )
    base = f"{environment}/operational/releases/{release_id}"
    with tempfile.TemporaryDirectory(prefix="blu-operational-") as directory:
        staged = Path(directory)
        _stage(catalog.resolve(), exports.resolve(), pending.resolve(), staged)
        artifacts = []
        for source in sorted(path for path in staged.rglob("*") if path.is_file()):
            relative = source.relative_to(staged).as_posix()
            digest = _hash(source)
            key = f"{base}/files/{relative}"
            with source.open("rb") as body:
                _put(client, bucket, key, body, metadata={"sha256": digest})
            remote = client.head_object(Bucket=bucket, Key=key)
            if remote.get("ContentLength") != source.stat().st_size or remote.get("Metadata", {}).get("sha256") != digest:
                raise ValueError("Um objeto operacional não passou a confirmação S3.")
            artifacts.append({"path": relative, "bytes": source.stat().st_size, "sha256": digest})
        manifest = {"schema_version": SCHEMA_VERSION, "release_id": release_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "state": "complete", "artifacts": artifacts}
        encoded = (json.dumps(manifest, separators=(",", ":")) + "\n").encode()
        digest = hashlib.sha256(encoded).hexdigest()
        _put(client, bucket, f"{base}/manifest.json", encoded,
             metadata={"sha256": digest, "state": "complete"})
        pointer = json.dumps({"schema_version": SCHEMA_VERSION,
                              "release_id": release_id,
                              "manifest_key": f"{base}/manifest.json",
                              "manifest_sha256": digest}, separators=(",", ":")).encode()
        _put(client, bucket, f"{environment}/operational/current.json", pointer,
             metadata={"sha256": hashlib.sha256(pointer).hexdigest()}, immutable=False)
    return manifest


def materialize(destination: Path, bucket: str, environment: str, client=None) -> dict:
    """Reconstrói a cache apenas a partir da release operacional ativa."""
    client = client or _client()
    pointer_key = f"{environment}/operational/current.json"
    pointer = json.loads(client.get_object(Bucket=bucket, Key=pointer_key)["Body"].read())
    manifest_bytes = client.get_object(Bucket=bucket, Key=pointer["manifest_key"])["Body"].read()
    if hashlib.sha256(manifest_bytes).hexdigest() != pointer["manifest_sha256"]:
        raise ValueError("O manifesto operacional ativo não passou a validação.")
    manifest = json.loads(manifest_bytes)
    if manifest.get("state") != "complete" or manifest.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("A release operacional ativa é incompatível ou incompleta.")
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".blu-cache-", dir=destination.parent) as directory:
        staged = Path(directory)
        base = f"{environment}/operational/releases/{manifest['release_id']}/files"
        for artifact in manifest["artifacts"]:
            relative = Path(artifact["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("O manifesto operacional contém um caminho inválido.")
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(bucket, f"{base}/{relative.as_posix()}", str(target))
            if target.stat().st_size != artifact["bytes"] or _hash(target) != artifact["sha256"]:
                raise ValueError("A cache operacional não corresponde ao manifesto.")
        for database in (staged / "data/portal/catalog.sqlite",
                         staged / "exports/itineraries/history.sqlite"):
            if database.is_file():
                with sqlite3.connect(database) as connection:
                    if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise ValueError("A cache SQLite operacional está corrompida.")
        previous = destination.with_name(f".{destination.name}.previous")
        if previous.exists():
            shutil.rmtree(previous)
        if destination.exists():
            os.replace(destination, previous)
        os.replace(staged, destination)
        if previous.exists():
            shutil.rmtree(previous)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    publish_parser = commands.add_parser("publish")
    publish_parser.add_argument("--catalog", type=Path, required=True)
    publish_parser.add_argument("--exports", type=Path, required=True)
    publish_parser.add_argument("--pending", type=Path, required=True)
    materialize_parser = commands.add_parser("materialize")
    materialize_parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    bucket, environment = _configuration()
    if args.command == "publish":
        result = publish(args.catalog, args.exports, args.pending, bucket, environment)
    else:
        result = materialize(args.destination, bucket, environment)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
