"""Aplica o gate versionado de qualidade e compatibilidade a um warehouse."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path


def _json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} não contém um objeto JSON.")
    return value


def _jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path.name}:{number} não contém um objeto JSON.")
        rows.append(value)
    return rows


def _exception_key(value: dict) -> tuple[str, str, str]:
    return tuple(str(value.get(name, "")) for name in ("table", "recordId", "field"))


def check(warehouse: Path, policy_path: Path, today: dt.date | None = None) -> dict:
    """Validar a entrega; devolver um resumo ou lançar ValueError."""
    policy = _json(policy_path)
    manifest = _json(warehouse / "manifest.json")
    report = _json(warehouse / "validation_report.json")
    if policy.get("schemaVersion") != 1:
        raise ValueError("Versão da política de qualidade não suportada.")
    contract = policy.get("warehouseManifest", {})
    if manifest.get("schema_version") not in contract.get("acceptedSchemaVersions", []):
        raise ValueError("Versão do manifesto do warehouse não suportada.")
    missing = [
        name for name in contract.get("requiredFiles", []) if not (warehouse / name).is_file()
    ]
    if missing:
        raise ValueError(f"Ficheiros obrigatórios em falta: {', '.join(missing)}")
    if report.get("status") != "passed" or manifest.get("validation", {}).get("status") != "passed":
        raise ValueError("A validação do warehouse não foi aprovada.")
    quality = policy.get("quality", {})
    if int(report.get("issue_count", -1)) > int(quality.get("maxIssues", 0)):
        raise ValueError("A entrega excede o limite de problemas de qualidade.")
    if len(manifest.get("pdf_errors", [])) > int(quality.get("maxPdfErrors", 0)):
        raise ValueError("A entrega excede o limite de erros de PDF.")

    current_day = today or dt.datetime.now(dt.timezone.utc).date()
    allowed: dict[tuple[str, str, str], dict] = {}
    for exception in policy.get("conflictExceptions", []):
        key = _exception_key(exception)
        required = ("reason", "owner", "expiresOn")
        if not all(key) or not all(str(exception.get(name, "")).strip() for name in required):
            raise ValueError("Exceção de conflito incompleta.")
        try:
            expires = dt.date.fromisoformat(str(exception["expiresOn"]))
        except ValueError as error:
            raise ValueError("Data de expiração inválida numa exceção de conflito.") from error
        if expires < current_day:
            raise ValueError(f"Exceção de conflito expirada: {'/'.join(key)}")
        if key in allowed:
            raise ValueError(f"Exceção de conflito duplicada: {'/'.join(key)}")
        allowed[key] = exception

    conflicts = _jsonl(warehouse / "structured_merge_conflicts.jsonl")
    actual = {
        (str(row.get("table", "")), str(row.get("record_id", "")), str(row.get("field", "")))
        for row in conflicts
    }
    unapproved = sorted(actual - set(allowed))
    unused = sorted(set(allowed) - actual)
    if unapproved:
        raise ValueError(f"Conflitos sem exceção aprovada: {unapproved}")
    if unused:
        raise ValueError(f"Exceções sem conflito correspondente: {unused}")
    return {
        "manifestSchemaVersion": manifest["schema_version"],
        "issues": report["issue_count"],
        "pdfErrors": len(manifest.get("pdf_errors", [])),
        "conflicts": len(actual),
        "exceptions": len(allowed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--warehouse", type=Path, required=True)
    parser.add_argument("--policy", type=Path, default=Path("config/data_quality_policy.json"))
    args = parser.parse_args()
    print(json.dumps(check(args.warehouse, args.policy), ensure_ascii=False))


if __name__ == "__main__":
    main()
