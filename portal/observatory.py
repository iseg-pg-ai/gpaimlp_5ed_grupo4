"""Leitura do Observatório nativo do portal; não altera a aplicação Streamlit."""
from __future__ import annotations

from contextlib import closing
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import sqlite3

from etl.observatory import CATALOG, TYPES, build_observatory


def clean(value):
    """Preservar zeros e impedir números não finitos no contrato JSON."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def observatory_snapshot(root: Path, *, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    database = (root / "blu_etl.sqlite").resolve()
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("BEGIN")
        names = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"atracoes", "restaurantes", "experiencias", "precos"}
        if not required <= names:
            raise ValueError("Entrega analítica incompleta.")
        allowed = required | {"model_observatory_catalog", "model_observatory_prices",
                             "structured_atividades", "structured_roteiros", "proposal_documents",
                             "structured_merge_conflicts"}
        columns = {"proposal_documents": "document_id", "structured_roteiros": "id_roteiro, data_explicita",
                   "structured_atividades": "id_atracao_base, id_roteiro, nome_etapa, cidade_da_base",
                   "structured_merge_conflicts": '"table", record_id, field'}
        tables = {name: [dict(row) for row in connection.execute(f'SELECT {columns.get(name, "*")} FROM "{name}"')]
                  for name in sorted(allowed & names)}
    # Uma transação de leitura conserva a mesma entrega para todas as entidades.
    models = build_observatory(tables, today=today)
    locations = {row["entity_key"]: row for row in tables.get("model_observatory_catalog", models["model_observatory_catalog"])}
    units = {str(row["record_id"]): row for row in tables.get("model_observatory_prices", models["model_observatory_prices"])}
    fields = models["model_field_evidence"]
    records = []
    for table, (identity, _, name, specs) in CATALOG.items():
        for row in tables[table]:
            key = f"{TYPES[table]}:{row.get(identity)}"
            location = locations.get(key, {})
            details = {label: row.get(field) for label, field in specs.items()}
            description = row.get({"atracoes": "descricao_curada", "restaurantes": "observacoes_da_base", "experiencias": "descricao"}[table])
            source = row.get({"atracoes": "site_fonte", "restaurantes": "fonte_indicada_na_base", "experiencias": "site_fonte"}[table])
            category = row.get("tipo_gastronomia_base" if table == "restaurantes" else "categoria")
            mentions = sorted({str(activity["id_roteiro"]) for activity in tables.get("structured_atividades", [])
                               if table == "atracoes" and activity.get("id_atracao_base") is not None
                               and str(activity["id_atracao_base"]) == str(row.get(identity))
                               and activity.get("id_roteiro") is not None})
            records.append({"key": key, "name": row.get(name), "kind": TYPES[table], "category": category,
                            "destination": location.get("destination"), "location": location.get("raw_location"),
                            "scope": location.get("geographic_scope"), "locationRule": location.get("location_rule"),
                            "description": description, "source": source, "latitude": row.get("latitude"),
                            "longitude": row.get("longitude"), "details": details,
                            "historicalRoutes": mentions if table == "atracoes" and "structured_atividades" in names else None})
    prices = []
    for row in tables["precos"]:
        unit = units.get(str(row.get("id")), {})
        prices.append({"id": row.get("id"), "name": row.get("nome_modalidade"), "category": row.get("categoria"),
                       "location": row.get("local"), "destination": unit.get("destination"),
                       "unit": unit.get("normalized_unit"), "rawUnit": row.get("unidade"),
                       "nature": row.get("preco_publico_vs_custo"), "currency": "EUR",
                       "reference": row.get("preco_referencia_eur"), "adult": row.get("adulto_eur"),
                       "senior": row.get("senior_eur"), "child": row.get("crianca_eur"),
                       "conditions": row.get("condicoes_verificadas"), "source": row.get("fonte"), "state": row.get("estado")})
    validation_path = root / "validation_report.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8")) if validation_path.exists() else None
    gaps = [{"table": table, "field": field, "missing": count, "records": details["record_count"]}
            for table, details in (validation or {}).get("tables", {}).items()
            for field, count in details.get("missing_values_by_column", {}).items() if count]
    activities = [{"name": row.get("nome_etapa"), "location": row.get("cidade_da_base"), "route": row.get("id_roteiro")}
                  for row in tables.get("structured_atividades", [])]
    region = json.loads((Path(__file__).resolve().parents[1] / "dashboard/region.geojson").read_text(encoding="utf-8"))
    outlines = []
    for feature in region["features"]:
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        outlines.extend(polygon[0] for polygon in polygons if polygon)
    return clean({"evaluatedOn": today.isoformat(), "records": records, "prices": prices, "evidence": fields,
                  "history": {"available": {"structured_atividades", "structured_roteiros"} <= names,
                              "routeCount": len(tables["structured_roteiros"]) if "structured_roteiros" in names else None,
                              "documentCount": len(tables["proposal_documents"]) if "proposal_documents" in names else None,
                              "datedCount": sum(bool(row.get("data_explicita")) for row in tables.get("structured_roteiros", [])) if "structured_roteiros" in names else None,
                              "activities": activities},
                  "validation": {"status": validation.get("status"), "issues": validation.get("issue_count")} if validation else None,
                  "gaps": gaps, "conflicts": [{"table": row.get("table"), "record": row.get("record_id"), "field": row.get("field")}
                                               for row in tables.get("structured_merge_conflicts", [])], "outlines": outlines})
