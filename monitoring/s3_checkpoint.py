"""Transporte S3 opcional para checkpoints operacionais já validados localmente."""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tarfile
import tempfile
from typing import Any


@dataclass(frozen=True)
class S3Config:
    bucket: str
    prefix: str
    environment: str
    kms_key_id: str | None = None

    @classmethod
    def from_environment(cls) -> "S3Config | None":
        bucket = os.environ.get("BLU_BACKUP_S3_BUCKET", "").strip()
        if not bucket:
            return None
        environment = os.environ.get("BLU_ENVIRONMENT", "development").strip()
        prefix = os.environ.get("BLU_BACKUP_S3_PREFIX", "blu-backups").strip(" /")
        safe = lambda value: value and all(char.isalnum() or char in "-_." for char in value)
        if not safe(environment) or not prefix or ".." in prefix.split("/"):
            raise ValueError("Configuração do caminho S3 inválida.")
        return cls(bucket=bucket, prefix=prefix, environment=environment,
                   kms_key_id=os.environ.get("BLU_BACKUP_S3_KMS_KEY_ID") or None)

    @property
    def root_prefix(self) -> str:
        return f"{self.prefix}/{self.environment}/checkpoint"


def _client():
    import boto3
    return boto3.client("s3")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _status(root: Path, **values: Any) -> None:
    runtime = Path(os.environ.get(
        "BLU_MONITORING_RUNTIME", str(root / "monitoring/runtime"))).resolve()
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = runtime / "s3-backup-status.json"
    temporary = target.with_suffix(".tmp")
    payload = {"at": datetime.now(timezone.utc).isoformat(), **values}
    temporary.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)


def _key(config: S3Config, snapshot: Path, created_at: str) -> str:
    date = datetime.fromisoformat(created_at).astimezone(timezone.utc)
    return (f"{config.root_prefix}/{date:%Y/%m/%d}/"
            f"{snapshot.name}.tar.gz")


def upload(root: Path, snapshot: Path, config: S3Config, client=None) -> dict:
    """Publica um checkpoint imutável e confirma tamanho, hash e metadados remotos."""
    from monitoring.checkpoint import _verify
    manifest = _verify(snapshot)
    client = client or _client()
    with tempfile.TemporaryDirectory(prefix="blu-s3-upload-") as temporary:
        archive = Path(temporary) / f"{snapshot.name}.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            bundle.add(snapshot, arcname=snapshot.name, recursive=True)
        digest = _sha256(archive)
        key = _key(config, snapshot, manifest["created_at"])
        extra = {"ServerSideEncryption": "aws:kms", "SSEKMSKeyId": config.kms_key_id}
        if not config.kms_key_id:
            extra = {"ServerSideEncryption": "AES256"}
        try:
            with archive.open("rb") as body:
                client.put_object(Bucket=config.bucket, Key=key, Body=body,
                                  ContentLength=archive.stat().st_size,
                                  ChecksumSHA256=base64.b64encode(bytes.fromhex(digest)).decode(),
                                  Metadata={"sha256": digest, "backup-id": snapshot.name,
                                            "schema-version": str(manifest["schema_version"])},
                                  IfNoneMatch="*", **extra)
            remote = client.head_object(Bucket=config.bucket, Key=key)
            if (remote.get("ContentLength") != archive.stat().st_size
                    or remote.get("Metadata", {}).get("sha256") != digest):
                raise ValueError("O objeto S3 não corresponde ao checkpoint enviado.")
            result = {"outcome": "passed", "operation": "upload",
                      "backup_id": snapshot.name, "bytes": archive.stat().st_size}
            _status(root, **result)
            return result
        except Exception as error:
            _status(root, outcome="failed", operation="upload",
                    backup_id=snapshot.name, error_code=type(error).__name__)
            raise


def _safe_extract(archive: Path, destination: Path) -> Path:
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        if not members:
            raise ValueError("O backup S3 está vazio.")
        base = destination.resolve()
        for member in members:
            target = (destination / member.name).resolve()
            if base not in target.parents and target != base:
                raise ValueError("O backup S3 contém um caminho inseguro.")
            if member.issym() or member.islnk() or member.isdev():
                raise ValueError("O backup S3 contém um tipo de ficheiro inseguro.")
        bundle.extractall(destination, members=members, filter="data")
    roots = [item for item in destination.iterdir() if item.is_dir()]
    if len(roots) != 1:
        raise ValueError("Estrutura do backup S3 inválida.")
    return roots[0]


def download_latest(root: Path, store: Path, config: S3Config,
                    backup_id: str | None = None, client=None) -> Path | None:
    """Obtém o checkpoint remoto mais recente válido sem substituir cópias locais."""
    client = client or _client()
    prefix = f"{config.root_prefix}/"
    objects, token = [], None
    while True:
        arguments = {"Bucket": config.bucket, "Prefix": prefix}
        if token:
            arguments["ContinuationToken"] = token
        response = client.list_objects_v2(**arguments)
        objects.extend(item for item in response.get("Contents", [])
                       if str(item.get("Key", "")).endswith(".tar.gz"))
        token = response.get("NextContinuationToken") if response.get("IsTruncated") else None
        if not token:
            break
    if backup_id:
        objects = [item for item in objects
                   if str(item["Key"]).endswith(f"/{backup_id}.tar.gz")]
    objects.sort(key=lambda item: item.get("LastModified", datetime.min.replace(
        tzinfo=timezone.utc)), reverse=True)
    for item in objects:
        try:
            head = client.head_object(Bucket=config.bucket, Key=item["Key"])
            digest = head.get("Metadata", {}).get("sha256")
            remote_id = head.get("Metadata", {}).get("backup-id")
            if not digest or not remote_id or (backup_id and remote_id != backup_id):
                raise ValueError("Metadados S3 incompletos.")
            with tempfile.TemporaryDirectory(prefix=".s3-download-", dir=store) as temporary:
                temporary_path = Path(temporary)
                archive = temporary_path / "checkpoint.tar.gz"
                client.download_file(config.bucket, item["Key"], str(archive))
                if _sha256(archive) != digest:
                    raise ValueError("O hash do backup S3 não corresponde aos metadados.")
                extracted = _safe_extract(archive, temporary_path / "extracted")
                from monitoring.checkpoint import _verify
                manifest = _verify(extracted)
                if manifest["backup_id"] != remote_id:
                    raise ValueError("O identificador do backup S3 é inconsistente.")
                target = store / remote_id
                if not target.exists():
                    os.replace(extracted, target)
                _status(root, outcome="passed", operation="download",
                        backup_id=remote_id, bytes=archive.stat().st_size)
                return target
        except Exception as error:
            _status(root, outcome="failed", operation="download",
                    backup_id=backup_id, error_code=type(error).__name__)
    return None
