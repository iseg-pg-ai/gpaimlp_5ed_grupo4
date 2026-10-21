"""Fontes do portal: pesquisa, paginação e enriquecimento sem alterar o warehouse."""

from contextlib import closing
import sqlite3
from etl.portal_catalog import CatalogStore, CatalogConflict, load_published_catalog
from html import escape
import json
import math
from pathlib import Path
import re
import sys
from string import Template


class UnknownTable(ValueError):
    """Apenas folhas publicadas pelo ETL podem ser consultadas."""


def dataset_tables(root: Path) -> list[str]:
    return sorted(
        file.name[:-6]
        for file in root.iterdir()
        if re.fullmatch(r"structured_[a-z0-9_]+\.jsonl", file.name) and file.is_file()
    )


def source_rows(root: Path, table: str) -> list[dict]:
    if table not in dataset_tables(root):
        raise UnknownTable("Folha indisponível.")
    with (root / f"{table}.jsonl").open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def query_dataset(root: Path, params: dict) -> dict:
    tables = dataset_tables(root)
    table = params.get("table")
    if table is None:
        table = next(iter(tables), None)
    if not table:
        return {"tables": tables, "rows": [], "total": 0, "page": 1}
    query = str(params.get("q") or "")[:200].lower()
    rows = [
        row for row in source_rows(root, table)
        if not query or query in json.dumps(row, ensure_ascii=False, separators=(",", ":")).lower()
    ]
    try:
        requested = float(params.get("page", 1))
        page = int(requested) if requested.is_integer() and 0 < requested <= 2**53 - 1 else 1
    except (ValueError, TypeError, OverflowError):
        page = 1
    page = min(max(1, math.ceil(len(rows) / 25)), page)
    return {"tables": tables, "table": table, "rows": rows[(page - 1) * 25:page * 25],
            "total": len(rows), "page": page}


def same_identifier(left, right) -> bool:
    # Equivalente a === para os identificadores escalares do JSON.
    if isinstance(left, (dict, list)) or isinstance(right, (dict, list)):
        return False
    return left == right and (type(left) is type(right) or
                             type(left) in (int, float) and type(right) in (int, float))


def enrich_records(root: Path, records: list[dict]) -> list[dict]:
    available = dataset_tables(root)
    bases = {"atracoes": ("structured_atracoes_base", "id"),
             "restaurantes": ("structured_restaurantes_base", "id_blu"),
             "experiencias": ("structured_experiencias_base", "nome_da_experiencia")}
    tables = {category: source_rows(root, table) if table in available else []
              for category, (table, _) in bases.items()}
    prices = source_rows(root, "structured_precos_base") if "structured_precos_base" in available else []
    enriched = []
    for record in records:
        key = bases[record["category"]][1]
        raw = record["raw"]
        # Ausência do identificador não corresponde a uma linha sem identificador.
        source = next((row for row in tables[record["category"]]
                       if same_identifier(row.get(key), raw[key])), {}) if key in raw else {}
        references = [row for row in prices if same_identifier(row.get("id"), raw[key])] if key in raw else []
        enriched.append({**record, "sourceData": {**raw, **source,
                        **({"tarifas_de_referencia": references} if references else {})}})
    return enriched


def historical_references(root: Path) -> dict:
    routes, activities, experiences, prices, conflicts = [source_rows(root, name) for name in (
        "structured_roteiros", "structured_atividades", "structured_experiencias",
        "structured_precos_propostas", "structured_merge_conflicts")]
    # Preparar as relações uma única vez, em vez de filtrar todas as folhas por roteiro.
    mentions_by_route, prices_by_route = {}, {}
    for row in activities + experiences:
        mentions_by_route.setdefault(row.get("id_roteiro"), []).append(row)
    for row in prices:
        prices_by_route.setdefault(row.get("id_roteiro"), []).append(row)
    return {"routes": [{**route, "mentions": mentions_by_route.get(route.get("id_roteiro"), []),
                        "prices": prices_by_route.get(route.get("id_roteiro"), [])} for route in routes],
            "priceCount": len(prices), "conflicts": conflicts}


def render_dataset(data: dict) -> str:
    """HTML sem scripts; todos os valores das fontes são escapados."""
    template = Template((Path(__file__).resolve().parents[1] / "dmc-workspace/templates/dataset-row.html").read_text(encoding="utf-8"))
    fragments = []
    for index, row in enumerate(data["rows"]):
        title = next((row[key] for key in ("nome_da_atracao", "estabelecimento", "nome_da_experiencia", "id", "id_roteiro", "_source_sheet")
                      if row.get(key) is not None), data.get("table", ""))
        fields = []
        for key, value in row.items():
            text = "—" if value is None or value == "" else (
                json.dumps(value, ensure_ascii=False, indent=2) if isinstance(value, (dict, list)) else
                str(value).lower() if isinstance(value, bool) else str(value))
            fields.append('<div class="min-w-0"><dt class="font-semibold break-words">'
                          + escape(key.replace("_", " ")) + '</dt><dd class="break-words whitespace-pre-wrap text-sm">'
                          + escape(text) + '</dd></div>')
        fragments.append(template.substitute(title=escape(str(title)),
                         source_row=escape(str(row.get("_source_row", index + 1))), fields="".join(fields)))
    return "".join(fragments)


def main() -> None:
    operation, directory = sys.argv[1:]
    root = Path(directory)
    params = json.load(sys.stdin)
    try:
        if operation.startswith("catalog-"):
            with closing(CatalogStore(root)) as store:
                if operation == "catalog-query":
                    warehouse = Path(params["warehouse"])
                    store.import_warehouse(warehouse)
                    if params.get("id"):
                        result = store.history(params["id"])
                    else:
                        published = {}
                        for category in ("atracoes", "restaurantes", "experiencias"):
                            with (warehouse / f"{category}.jsonl").open(encoding="utf-8") as stream:
                                for line in stream:
                                    if line.strip():
                                        row = json.loads(line)
                                        if row.get("_catalog_status") == "approved":
                                            published[row.get("_catalog_id")] = row.get("_catalog_revision")
                        result = [{**record, "published": record["status"] == "approved" and
                                   same_identifier(published.get(record["id"]), record["revision"])}
                                  for record in enrich_records(warehouse, store.list())]
                elif operation == "catalog-load-published":
                    result = load_published_catalog(store, params["warehouse"], params["overrides"])
                elif operation == "catalog-list":
                    result = store.list()
                elif operation == "catalog-history":
                    result = store.history(params["id"])
                elif operation == "catalog-import":
                    store.import_warehouse(params["warehouse"])
                    result = None
                elif operation == "catalog-save":
                    result = store.save_validated(params["input"])
                elif operation == "catalog-published":
                    result = store.published_flags(params["rows"])
                else:
                    raise ValueError("Operação de catálogo desconhecida.")
        elif operation == "query":
            result = query_dataset(root, params)
        elif operation == "observatory":
            from portal.observatory import observatory_snapshot
            result = observatory_snapshot(root)
        elif operation == "weather":
            from portal.weather import fetch_day_weather
            result = fetch_day_weather(params)
        elif operation == "prompt":
            from portal.prompt import render_prompt
            result = render_prompt(params)
        elif operation == "references":
            result = historical_references(root)
        elif operation == "explore":
            result = query_dataset(root, params)
            result["html"] = render_dataset(result)
        else:
            raise ValueError("Operação desconhecida.")
        response = {"ok": True, "data": result}
    except CatalogConflict as error:
        response = {"ok": False, "code": "CATALOG_CONFLICT", "error": str(error)}
    except UnknownTable:
        response = {"ok": False, "code": "UNKNOWN_TABLE", "error": "Folha indisponível."}
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as error:
        if operation == "catalog-save" and isinstance(error, ValueError):
            response = {"ok": False, "code": "CATALOG_INVALID", "error": str(error)}
        elif operation.startswith("catalog-"):
            response = {"ok": False, "code": "CATALOG_UNAVAILABLE", "error": "Não foi possível consultar ou guardar o catálogo."}
        else:
            response = {"ok": False,
                    "code": "EXPORT_UNAVAILABLE" if operation == "prompt" else "DATASET_UNAVAILABLE",
                    "error": "Não foi possível preparar o TXT da versão guardada." if operation == "prompt" else "Dataset indisponível. Execute o ETL."}
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
