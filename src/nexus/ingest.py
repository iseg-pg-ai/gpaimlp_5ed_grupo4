"""Ingestão de ficheiros de fornecedores (CSV ou JSON) para o modelo canónico, com linhagem.

Colunas exatas: as de `COLUMNS` têm de existir todas e nenhuma outra; os valores opcionais podem
ficar vazios (desconhecido). Cada linha é validada sozinha: uma linha errada é recusada com o motivo
e a referência `ficheiro#row=N`, sem travar as outras. Ofertas repetidas no mesmo lote são recusadas.
"""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from nexus.model import ValidationError, checksum, validate_offer

CONTRACT = "nexus/supplier-file@0.1"
COLUMNS = (
    "supplier_id", "supplier_name", "product_key", "title", "channel", "currency", "unit",
    "sell_price", "cost_price", "min_pax", "valid_from", "valid_to",
)


def _rows(path: Path):
    """Linhas do ficheiro como dicionários de texto, com o número da linha de origem."""
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("o JSON tem de ser uma lista de linhas")
        for number, row in enumerate(data, start=1):
            yield number, row, sorted(row) if isinstance(row, dict) else None
        return
    if path.suffix.lower() != ".csv":
        raise ValueError("formato não suportado: use .csv ou .json")
    first = text.splitlines()[0] if text else ""
    delimiter = ";" if first.count(";") > first.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    header = [name.strip() for name in reader.fieldnames or []]
    for number, row in enumerate(reader, start=2):
        yield number, {key.strip(): (value or "").strip() for key, value in row.items() if key is not None}, header


def ingest_supplier_file(path, *, source_id: str, ingested_at: str):
    """Devolve (ofertas, recusadas). `source_id` identifica o fornecedor ou o lote (ex.: «supplier-sintra»)."""
    path = Path(path)
    offers, rejected, seen = [], [], set()
    try:
        rows = list(_rows(path))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        return [], [{"ref": path.name, "errors": [str(error)]}]
    for number, row, header in rows:
        ref = f"{path.name}#row={number}"
        if not isinstance(row, dict):
            rejected.append({"ref": ref, "errors": ["a linha tem de ser um objeto"]})
            continue
        columns = set(header or row)
        missing, extra = sorted(set(COLUMNS) - columns), sorted(columns - set(COLUMNS))
        if missing or extra:
            rejected.append({"ref": ref, "errors": [f"colunas em falta {missing}" if missing else "", f"colunas desconhecidas {extra}" if extra else ""]})
            rejected[-1]["errors"] = [item for item in rejected[-1]["errors"] if item]
            continue
        value = lambda key: None if row.get(key) in ("", None) else row.get(key)
        raw = {
            "offer_id": f"{source_id}:{value('supplier_id') or 'x'}:{value('product_key') or 'x'}:{value('valid_from') or 'open'}",
            "product_key": value("product_key"), "title": value("title"), "channel": value("channel"),
            "source_id": source_id, "supplier_id": value("supplier_id"), "supplier_name": value("supplier_name"),
            "currency": value("currency"), "unit": value("unit"), "price_basis": "quoted",
            "sell_price": value("sell_price"), "cost_price": value("cost_price"), "min_pax": value("min_pax"),
            "valid_from": value("valid_from"), "valid_to": value("valid_to"),
            "lineage": {"source_id": source_id, "source_type": "file", "ref": ref, "contract": CONTRACT, "ingested_at": ingested_at, "checksum": checksum(row)},
        }
        try:
            offer = validate_offer(raw)
        except ValidationError as error:
            rejected.append({"ref": ref, "errors": error.errors})
            continue
        if offer["channel"] == "reseller":
            rejected.append({"ref": ref, "errors": ["channel: ficheiros de fornecedores são direct ou own; a revenda entra pelo adaptador da API"]})
            continue
        if offer["offer_id"] in seen:
            rejected.append({"ref": ref, "errors": [f"oferta repetida no lote: {offer['offer_id']}"]})
            continue
        seen.add(offer["offer_id"])
        offers.append(offer)
    return offers, rejected
