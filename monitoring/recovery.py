"""Valida dados autoritativos e restaura apenas conjuntos ausentes ou inválidos."""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

from etl.portal_catalog import CatalogStore

from monitoring.backup import verify_backup

ROOT = Path(__file__).resolve().parents[1]


def _catalog_valid(path: Path) -> bool:
    """Confirma a integridade e as tabelas mínimas sem alterar o catálogo."""
    try:
        with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            tables = {row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'")}
            return integrity and {"catalog_records", "catalog_history"}.issubset(tables)
    except (OSError, sqlite3.Error, TypeError):
        return False


def _warehouse_valid(path: Path) -> bool:
    """Aceita apenas um warehouse cuja última validação tenha sido aprovada."""
    try:
        report = json.loads((path / "validation_report.json").read_text())
        manifest = json.loads((path / "manifest.json").read_text())
        return report["status"] == "passed" and bool(manifest["ran_at_utc"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return False


def system_state(root: Path) -> dict[str, bool]:
    """Devolve o estado dos três conjuntos necessários para reerguer o sistema."""
    return {"catalog": _catalog_valid(root / "data/portal/catalog.sqlite"),
            "warehouse": _warehouse_valid(root / "warehouse"),
            "itineraries": (root / "exports/itineraries").is_dir()}


def _latest_backup(runtime: Path) -> Path:
    """Seleciona o backup mais recente; a verificação criptográfica ocorre depois."""
    candidates = sorted((runtime / "backups").glob("*/manifest.json"), reverse=True)
    if not candidates:
        raise ValueError("Não existe backup local para recuperação.")
    return candidates[0].parent


def _has_backups(runtime: Path) -> bool:
    """Não confundir uma instalação nova com uma recuperação sem dados."""
    return any((runtime / "backups").glob("*/manifest.json"))


def _fresh_install(root: Path, runtime: Path) -> bool:
    """Aceitar bootstrap apenas quando nunca existiu estado operacional local."""
    return (not (root / "data/portal/catalog.sqlite").exists()
            and not (root / "exports/itineraries").exists()
            and not _has_backups(runtime))


def _initialize_fresh_install(root: Path) -> dict:
    """Criar estado local inicial sem publicar nem inventar revisões aprovadas."""
    warehouse = root / "warehouse"
    if not _warehouse_valid(warehouse):
        raise ValueError("O warehouse versionado não é válido para inicializar o sistema.")

    catalog = root / "data/portal/catalog.sqlite"
    catalog.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".bootstrap-", dir=catalog.parent) as directory:
        temporary_root = Path(directory)
        with closing(CatalogStore(temporary_root)) as store:
            store.import_warehouse(warehouse)
        temporary = temporary_root / "catalog.sqlite"
        if not _catalog_valid(temporary):
            raise ValueError("A inicialização do catálogo não produziu uma base válida.")
        os.replace(temporary, catalog)

    (root / "exports/itineraries").mkdir(parents=True)
    state = system_state(root)
    if not all(state.values()):
        raise ValueError("A inicialização local não produziu todos os conjuntos necessários.")
    return {"outcome": "initialized", "initialized": ["catalog", "itineraries"],
            "restored": [], "state": state}


def _replace_file(source: Path, target: Path) -> None:
    """Copia para um temporário e faz a substituição atómica do ficheiro."""
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".recovery.tmp")
    shutil.copy2(source, temporary)
    os.replace(temporary, target)


def _replace_directory(source: Path, target: Path, quarantine: Path) -> None:
    """Prepara a cópia completa antes de colocar a versão anterior em quarentena."""
    temporary = target.parent / f".{target.name}.recovery.tmp"
    if temporary.exists():
        shutil.rmtree(temporary)
    shutil.copytree(source, temporary)
    if target.exists():
        quarantine.parent.mkdir(parents=True, exist_ok=True)
        os.replace(target, quarantine)
    os.replace(temporary, target)


def ensure_recovery(root: Path, runtime: Path) -> dict:
    """Preserva conjuntos válidos e recupera apenas os que falharem a validação."""
    before = system_state(root)
    required = [name for name, valid in before.items() if not valid]
    if not required:
        return {"outcome": "preserved", "restored": [], "state": before}
    if _fresh_install(root, runtime):
        return _initialize_fresh_install(root)
    backup = _latest_backup(runtime)
    # Nunca restaurar um backup antes de confirmar manifesto, hashes e SQLite.
    verify_backup(backup, runtime)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    quarantine = runtime / "recovery-quarantine" / stamp
    restored = []
    if "catalog" in required and (backup / "catalog.sqlite").is_file():
        _replace_file(backup / "catalog.sqlite", root / "data/portal/catalog.sqlite")
        restored.append("catalog")
    if "warehouse" in required and (backup / "warehouse").is_dir():
        _replace_directory(backup / "warehouse", root / "warehouse", quarantine / "warehouse")
        restored.append("warehouse")
    if "itineraries" in required and (backup / "itineraries").is_dir():
        _replace_directory(backup / "itineraries", root / "exports/itineraries",
                           quarantine / "itineraries")
        restored.append("itineraries")
    after = system_state(root)
    if not all(after.values()):
        raise ValueError("O backup não contém todos os conjuntos necessários.")
    return {"outcome": "restored", "restored": restored, "state": after}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inspect", "ensure"))
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--runtime", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    runtime = args.runtime.resolve() if args.runtime else root / "monitoring/runtime"
    result = system_state(root) if args.command == "inspect" else ensure_recovery(root, runtime)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
