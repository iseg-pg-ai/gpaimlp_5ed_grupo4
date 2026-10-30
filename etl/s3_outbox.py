# Reenvia alterações pendentes para S3 com identificação e verificação das operações já
# publicadas.
"""Envio idempotente das alterações operacionais confirmadas para o bucket de dados."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _validate(path: Path) -> dict:
    if path.stat().st_size > 20_000_000:
        raise ValueError("Evento da outbox excede o limite permitido.")
    event = json.loads(path.read_text())
    if (event.get("schemaVersion") != 1
            or event.get("syncState") != "pending"
            or event.get("operationType") not in {"catalog.save", "version.save"}
            or not isinstance(event.get("entity"), str)
            or not isinstance(event.get("payload"), dict)
            or not isinstance(event.get("operationId"), str)
            or len(event["operationId"]) != 64
            or any(char not in "0123456789abcdef" for char in event["operationId"])):
        raise ValueError("Evento da outbox inválido.")
    datetime.fromisoformat(event["occurredAt"])
    return event


def _semantic_event(event: dict) -> dict:
    """Exclui apenas timestamps de transporte de uma repetição idempotente."""
    payload = event["payload"]
    if event["operationType"] == "version.save":
        payload = {key: value for key, value in payload.items() if key != "createdAt"}
    return {
        "operationId": event["operationId"],
        "operationType": event["operationType"],
        "entity": event["entity"],
        "payload": payload,
    }


def _existing_matches(client, bucket: str, key: str, local: dict) -> bool:
    """Confirma integridade e equivalência de um objeto já publicado."""
    response = client.get_object(Bucket=bucket, Key=key)
    body = response["Body"].read()
    metadata = response.get("Metadata", {})
    digest = hashlib.sha256(body).hexdigest()
    if metadata.get("sha256") != digest:
        return False
    try:
        remote = json.loads(body)
    except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    return _semantic_event(remote) == _semantic_event(local)


def flush(root: Path, bucket: str, environment: str, client=None) -> dict:
    """Confirma cada objeto no S3 antes de remover o respetivo evento local."""
    directory = root / "data-s3-outbox"
    if not directory.is_dir():
        return {"outcome": "passed", "uploaded": 0, "pending": 0}
    files = sorted(directory.glob("*.json"))
    if not files:
        return {"outcome": "passed", "uploaded": 0, "pending": 0}
    if client is None:
        import boto3
        client = boto3.client("s3")
    uploaded = 0
    for path in files:
        event = _validate(path)
        occurred = datetime.fromisoformat(event["occurredAt"]).astimezone(timezone.utc)
        kind = event["operationType"].replace(".", "-")
        key = (f"{environment}/operational-changes/{occurred:%Y/%m/%d}/"
               f"{kind}/{event['operationId']}.json")
        digest = _hash(path)
        metadata = {"sha256": digest, "operation-id": event["operationId"],
                    "operation-type": event["operationType"]}
        created = False
        try:
            with path.open("rb") as body:
                client.put_object(Bucket=bucket, Key=key, Body=body,
                                  ContentLength=path.stat().st_size,
                                  ServerSideEncryption="AES256", IfNoneMatch="*",
                                  Metadata=metadata)
            created = True
        except Exception:
            # Uma repetição após confirmação remota é sucesso apenas se o objeto
            # existente tiver conteúdo operacional equivalente. Os timestamps
            # de transporte podem mudar quando um checkpoint é restaurado.
            if not _existing_matches(client, bucket, key, event):
                raise
        remote = client.head_object(Bucket=bucket, Key=key)
        if ((created and (remote.get("ContentLength") != path.stat().st_size
                         or remote.get("Metadata", {}).get("sha256") != digest))
                or remote.get("ServerSideEncryption") != "AES256"
                or remote.get("Metadata", {}).get("operation-id") != event["operationId"]
                or remote.get("Metadata", {}).get("operation-type") != event["operationType"]):
            raise ValueError("A alteração operacional não foi confirmada no S3.")
        path.unlink()
        uploaded += 1
    return {"outcome": "passed", "uploaded": uploaded,
            "pending": len(list(directory.glob("*.json")))}


def main() -> None:
    root = Path(os.environ.get(
        "BLU_OPERATIONAL_DIR", "exports/portal-persistence")).resolve()
    bucket = os.environ.get("BLU_DATA_S3_BUCKET", "").strip()
    environment = os.environ.get("BLU_ENVIRONMENT", "development").strip()
    if not bucket:
        raise ValueError("BLU_DATA_S3_BUCKET não está configurado.")
    print(json.dumps(flush(root, bucket, environment)))


if __name__ == "__main__":
    main()
