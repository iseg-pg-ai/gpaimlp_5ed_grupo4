"""Reconstrução integral da cache efémera a partir dos dois buckets S3."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time

from etl.operational_s3 import _configuration, materialize, publish
from etl.pipeline import run
from etl.s3_transport import publish as publish_delivery
from etl.s3_transport import restore_missing

ROOT = Path(__file__).resolve().parents[1]


def _database_valid(path: Path) -> bool:
    try:
        with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as connection:
            return connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    except (OSError, sqlite3.Error):
        return False


def _validate_runtime(root: Path) -> None:
    if not _database_valid(root / "data/portal/catalog.sqlite"):
        raise ValueError("A cache não contém um catálogo SQLite válido.")
    if not _database_valid(root / "exports/itineraries/history.sqlite"):
        raise ValueError("A cache não contém um histórico SQLite válido.")
    report = json.loads((root / "warehouse/validation_report.json").read_text())
    if report.get("status") != "passed" or not (root / "warehouse/blu_etl.sqlite").is_file():
        raise ValueError("A cache não contém um warehouse aprovado.")


def _promote(staged: Path, destination: Path) -> None:
    previous = destination.with_name(f".{destination.name}.previous")
    if previous.exists():
        shutil.rmtree(previous)
    if destination.exists():
        os.replace(destination, previous)
    try:
        os.replace(staged, destination)
    except Exception:
        if previous.exists() and not destination.exists():
            os.replace(previous, destination)
        raise
    if previous.exists():
        shutil.rmtree(previous)


def rebuild(recovered: Path | None, destination: Path, client=None) -> dict:
    """Republica o backup recuperado e constrói uma cache só a partir do S3."""
    started = time.monotonic()
    destination = destination.resolve()
    bucket, environment = _configuration()
    operational = None
    if recovered is not None:
        recovered = recovered.resolve()
        if (recovered == destination or recovered in destination.parents
                or destination in recovered.parents):
            raise ValueError("A recuperação e a cache têm de ser diretórios independentes.")
        catalog = recovered / "data/portal/catalog.sqlite"
        itineraries = recovered / "exports/itineraries"
        pending = recovered / "exports/portal-persistence"
        if not _database_valid(catalog) or not _database_valid(itineraries / "history.sqlite"):
            raise ValueError("O checkpoint recuperado não contém as bases operacionais válidas.")
        operational = publish(catalog, itineraries, pending, bucket, environment, client)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".blu-runtime-", dir=destination.parent) as temporary:
        staged = Path(temporary) / "cache"
        materialize(staged, bucket, environment, client)
        sources = restore_missing("sources", staged / "data", bucket, environment, client)
        manifest = run(staged / "data", staged / "warehouse")
        warehouse = publish_delivery(
            "warehouse", staged / "warehouse", bucket, environment, client
        )
        _validate_runtime(staged)
        _promote(staged, destination)

    evidence = {
        "at": datetime.now(timezone.utc).isoformat(),
        "outcome": "passed",
        "execution_id": os.environ.get("EXECUTION_ID"),
        "runtime": str(destination),
        "operational_release": (
            operational["release_id"] if operational else "current"
        ),
        "source_release": sources["release_id"],
        "warehouse_release": warehouse["release_id"],
        "warehouse_validation": manifest["validation"]["status"],
        "recovery_seconds": round(time.monotonic() - started, 3),
    }
    runtime = ROOT / "monitoring/runtime"
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = runtime / "cloud-runtime-evidence.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(evidence, indent=2) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovered", type=Path)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(rebuild(args.recovered, args.destination), indent=2))


if __name__ == "__main__":
    main()
