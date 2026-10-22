"""Publicação e recuperação imutáveis de fontes e entregas ETL no Amazon S3."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Iterable
from uuid import uuid4

from etl.sources import LocalSource

ROOT = Path(__file__).resolve().parents[1]
KINDS = {"sources", "warehouse"}


def _client():
    import boto3
    return boto3.client("s3")


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _configuration() -> tuple[str, str]:
    bucket = os.environ.get("BLU_DATA_S3_BUCKET", "").strip()
    environment = os.environ.get("BLU_ENVIRONMENT", "development").strip()
    if not bucket:
        raise ValueError("BLU_DATA_S3_BUCKET não está configurado.")
    if not environment or not all(char.isalnum() or char in "-_." for char in environment):
        raise ValueError("BLU_ENVIRONMENT é inválido.")
    return bucket, environment


def _status(**values) -> None:
    runtime = ROOT / "monitoring/runtime"
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = runtime / "data-s3-status.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps({"at": datetime.now(timezone.utc).isoformat(),
                                     **values}, separators=(",", ":")) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)


def _source_files(root: Path) -> list[Path]:
    workbook, supplement, pdfs, inventory = LocalSource(root).discover()
    allowed = {item["key"] for item in inventory["objects"]}
    files = [workbook, *pdfs]
    if supplement:
        files.append(supplement)
    # Inclui workbooks de referência inventariados, sem incluir data/portal.
    for relative in allowed:
        path = root / relative
        if path not in files:
            files.append(path)
    return sorted(set(files), key=lambda path: path.relative_to(root).as_posix())


def _warehouse_files(root: Path) -> list[Path]:
    report = json.loads((root / "validation_report.json").read_text())
    if report.get("status") != "passed":
        raise ValueError("O warehouse não passou a validação e não pode ser publicado.")
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("validation", {}).get("status") != "passed":
        raise ValueError("O manifesto do warehouse não confirma a validação.")
    return sorted((path for path in root.rglob("*") if path.is_file()),
                  key=lambda path: path.relative_to(root).as_posix())


def _files(kind: str, root: Path) -> list[Path]:
    if kind not in KINDS:
        raise ValueError("Tipo de publicação S3 desconhecido.")
    if root.is_symlink() or not root.is_dir():
        raise ValueError("A origem S3 tem de ser um diretório local válido.")
    return _source_files(root) if kind == "sources" else _warehouse_files(root)


def _put_verified(client, bucket: str, key: str, path: Path, digest: str,
                  metadata: dict[str, str]) -> None:
    with path.open("rb") as body:
        client.put_object(Bucket=bucket, Key=key, Body=body,
                          ContentLength=path.stat().st_size,
                          ServerSideEncryption="AES256", IfNoneMatch="*",
                          Metadata={**metadata, "sha256": digest})
    remote = client.head_object(Bucket=bucket, Key=key)
    if (remote.get("ContentLength") != path.stat().st_size
            or remote.get("Metadata", {}).get("sha256") != digest
            or remote.get("ServerSideEncryption") != "AES256"):
        raise ValueError("O objeto S3 publicado não passou a confirmação.")


def publish(kind: str, root: Path, bucket: str, environment: str, client=None) -> dict:
    """Publica ficheiros e, por último, o manifesto que confirma a release."""
    client = client or _client()
    root = root.resolve()
    files = _files(kind, root)
    created = datetime.now(timezone.utc)
    release_id = created.strftime("%Y%m%dT%H%M%S.%fZ-") + uuid4().hex[:12]
    prefix = f"{environment}/{kind}/{created:%Y/%m/%d}/{release_id}"
    entries = []
    try:
        for path in files:
            relative = path.relative_to(root).as_posix()
            digest = _hash(path)
            key = f"{prefix}/files/{relative}"
            _put_verified(client, bucket, key, path, digest,
                          {"release-id": release_id, "kind": kind})
            entries.append({"path": relative, "bytes": path.stat().st_size,
                            "sha256": digest, "key": key})
        manifest = {"schema_version": 1, "state": "complete", "kind": kind,
                    "environment": environment, "release_id": release_id,
                    "created_at": created.isoformat(), "files": entries}
        with tempfile.TemporaryDirectory(prefix="blu-data-manifest-") as temporary:
            path = Path(temporary) / "manifest.json"
            path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
            _put_verified(client, bucket, f"{prefix}/manifest.json", path, _hash(path),
                          {"release-id": release_id, "kind": kind, "state": "complete"})
        result = {"outcome": "passed", "operation": "publish", "kind": kind,
                  "release_id": release_id, "file_count": len(entries),
                  "bytes": sum(item["bytes"] for item in entries)}
        _status(**result)
        return result
    except Exception as error:
        _status(outcome="failed", operation="publish", kind=kind,
                release_id=release_id, error_code=type(error).__name__)
        raise


def _manifest_keys(client, bucket: str, prefix: str) -> Iterable[str]:
    token = None
    while True:
        arguments = {"Bucket": bucket, "Prefix": prefix}
        if token:
            arguments["ContinuationToken"] = token
        response = client.list_objects_v2(**arguments)
        yield from (item["Key"] for item in response.get("Contents", [])
                    if str(item.get("Key", "")).endswith("/manifest.json")
                    and "/files/" not in str(item.get("Key", "")))
        token = response.get("NextContinuationToken") if response.get("IsTruncated") else None
        if not token:
            break


def fetch_latest(kind: str, destination: Path, bucket: str, environment: str,
                 client=None) -> dict:
    """Descarrega a release completa mais recente para um destino novo ou vazio."""
    if kind not in KINDS:
        raise ValueError("Tipo de publicação S3 desconhecido.")
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("O destino da recuperação S3 tem de estar vazio.")
    client = client or _client()
    keys = sorted(_manifest_keys(client, bucket, f"{environment}/{kind}/"), reverse=True)
    if not keys:
        raise FileNotFoundError("Não existe uma release S3 completa.")
    for manifest_key in keys:
        try:
            with tempfile.TemporaryDirectory(prefix="blu-data-fetch-",
                                             dir=destination.parent) as temporary:
                stage = Path(temporary) / "release"
                stage.mkdir()
                manifest_path = Path(temporary) / "manifest.json"
                client.download_file(bucket, manifest_key, str(manifest_path))
                head = client.head_object(Bucket=bucket, Key=manifest_key)
                if _hash(manifest_path) != head.get("Metadata", {}).get("sha256"):
                    raise ValueError("Manifesto S3 corrompido.")
                manifest = json.loads(manifest_path.read_text())
                if (manifest.get("state") != "complete" or manifest.get("kind") != kind
                        or manifest.get("environment") != environment):
                    raise ValueError("Manifesto S3 inválido.")
                for item in manifest["files"]:
                    relative = Path(item["path"])
                    if relative.is_absolute() or ".." in relative.parts:
                        raise ValueError("Caminho inseguro no manifesto S3.")
                    target = stage / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    client.download_file(bucket, item["key"], str(target))
                    if target.stat().st_size != item["bytes"] or _hash(target) != item["sha256"]:
                        raise ValueError("Ficheiro S3 corrompido.")
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists():
                    destination.rmdir()
                os.replace(stage, destination)
                result = {"outcome": "passed", "operation": "fetch", "kind": kind,
                          "release_id": manifest["release_id"],
                          "file_count": len(manifest["files"])}
                _status(**result)
                return result
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            continue
    _status(outcome="failed", operation="fetch", kind=kind,
            error_code="NoValidRelease")
    raise ValueError("Nenhuma release S3 passou a validação de integridade.")


def restore_missing(kind: str, destination: Path, bucket: str, environment: str,
                    client=None) -> dict:
    """Valida uma release completa e recupera apenas ficheiros locais ausentes."""
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="blu-data-restore-",
                                     dir=destination.parent) as temporary:
        staged = Path(temporary) / kind
        result = fetch_latest(kind, staged, bucket, environment, client)
        restored = 0
        for source in sorted(staged.rglob("*")):
            relative = source.relative_to(staged)
            target = destination / relative
            if source.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            elif not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
                restored += 1
        result.update(operation="restore-missing", restored=restored)
        _status(**result)
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("publish", "fetch-latest", "restore-missing"))
    parser.add_argument("kind", choices=sorted(KINDS))
    parser.add_argument("--path", type=Path, required=True)
    args = parser.parse_args()
    bucket, environment = _configuration()
    if args.command == "publish":
        print(json.dumps(publish(args.kind, args.path, bucket, environment)))
    elif args.command == "fetch-latest":
        print(json.dumps(fetch_latest(args.kind, args.path, bucket, environment)))
    else:
        print(json.dumps(restore_missing(args.kind, args.path, bucket, environment)))


if __name__ == "__main__":
    main()
