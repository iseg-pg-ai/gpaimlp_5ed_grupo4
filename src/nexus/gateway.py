"""Gateway HTTP do NEXUS (WSGI, só biblioteca padrão).

Cada pedido lê de novo a pasta de dados; não há base de dados nem catálogo paralelo:

    <dados>/getyourguide/tours/*.json            respostas guardadas de GET /1/tours
    <dados>/getyourguide/price-breakdown/<id>.json  respostas de POST /1/tours/<id>/price-breakdown
    <dados>/suppliers/<source_id>/*.csv|*.json   ficheiros de fornecedores (um source_id por pasta)

Configuração (`config/nexus.json`): fonte GetYourGuide, comissão do acordo (null = desconhecida)
e o mapeamento explícito tour → produto BLU.

    PYTHONPATH=src python -m nexus.gateway --data <dados> --config config/nexus.json
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from nexus import __version__
from nexus.adapters.getyourguide import price_breakdown_to_offers, tours_to_offers
from nexus.ingest import ingest_supplier_file
from nexus.margins import analyse

OPENAPI = Path(__file__).with_name("openapi.json")
PARAMS = {"objective", "pax", "as_of", "product_key"}


def _stamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")


def load(data_dir, config: dict) -> dict:
    """Todas as ofertas válidas, as recusadas e as tours sem mapeamento, com a contagem por fonte."""
    data_dir = Path(data_dir)
    offers, rejected, unmatched, sources = [], [], [], {}

    def take(source_id, result):
        found, refused, *rest = result
        offers.extend(found)
        rejected.extend({"source_id": source_id, **item} for item in refused)
        if rest:
            unmatched.extend({"source_id": source_id, **item} for item in rest[0])
        sources.setdefault(source_id, {"offers": 0, "rejected": 0})
        sources[source_id]["offers"] += len(found)
        sources[source_id]["rejected"] += len(refused)

    gyg = config.get("getyourguide")
    if gyg:
        source = {"id": gyg["source_id"], "commission_rate": gyg.get("commission_rate")}
        mapping = {str(key): value for key, value in (gyg.get("product_mapping") or {}).items()}
        titles = {}
        for path in sorted((data_dir / "getyourguide" / "tours").glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            for tour in ((payload.get("data") or {}).get("tours") or []):
                titles[str(tour.get("tour_id"))] = tour.get("title")
            take(source["id"], tours_to_offers(payload, source=source, mapping=mapping, ingested_at=_stamp(path), ref=f"{path.name}"))
        for path in sorted((data_dir / "getyourguide" / "price-breakdown").glob("*.json")):
            tour_id = path.stem
            take(source["id"], price_breakdown_to_offers(json.loads(path.read_text(encoding="utf-8")), tour_id=tour_id, title=titles.get(tour_id) or mapping.get(tour_id) or tour_id,
                                                         source=source, mapping=mapping, ingested_at=_stamp(path), ref=path.name))
    for folder in sorted(path for path in (data_dir / "suppliers").glob("*") if path.is_dir()):
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in (".csv", ".json"):
                take(folder.name, ingest_supplier_file(path, source_id=folder.name, ingested_at=_stamp(path)) + ([],))
    return {"offers": offers, "rejected": rejected, "unmatched": unmatched, "sources": sources}


def create_app(data_dir, config: dict):
    def reply(start, status, body):
        payload = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
        start(status, [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(payload))), ("Cache-Control", "no-store")])
        return [payload]

    def app(environ, start):
        method, path = environ.get("REQUEST_METHOD", "GET"), environ.get("PATH_INFO", "/")
        if method != "GET":
            return reply(start, "405 Method Not Allowed", {"error": "Só GET."})
        if path == "/health":
            return reply(start, "200 OK", {"status": "ok", "version": __version__})
        if path == "/v1/openapi.json":
            return reply(start, "200 OK", json.loads(OPENAPI.read_text(encoding="utf-8")))
        if path != "/v1/margins":
            return reply(start, "404 Not Found", {"error": "Rota desconhecida."})
        query = parse_qs(environ.get("QUERY_STRING", ""), keep_blank_values=True)
        unknown = sorted(set(query) - PARAMS)
        if unknown:
            return reply(start, "400 Bad Request", {"error": f"Parâmetros desconhecidos: {unknown}"})
        one = lambda key: (query.get(key) or [None])[-1]
        try:
            pax_text = one("pax") or "2"
            if not pax_text.isdigit():
                raise ValueError("pax tem de ser um inteiro de 1 a 100")
            as_of = date.fromisoformat(one("as_of")) if one("as_of") else None
            loaded = load(data_dir, config)
            result = analyse(loaded["offers"], objective=one("objective") or "profit", pax=int(pax_text), as_of=as_of, product_key=one("product_key"))
        except ValueError as error:
            return reply(start, "400 Bad Request", {"error": str(error)})
        return reply(start, "200 OK", {**result, "sources": loaded["sources"], "rejected": loaded["rejected"], "unmatched": loaded["unmatched"]})

    return app


def main(argv=None):
    parser = argparse.ArgumentParser(description="NEXUS Integration Gateway v0.1")
    parser.add_argument("--data", required=True, help="pasta com getyourguide/ e suppliers/")
    parser.add_argument("--config", default="config/nexus.json")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8088)
    args = parser.parse_args(argv)
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    with make_server(args.host, args.port, create_app(args.data, config)) as server:
        print(f"NEXUS {__version__} em http://{args.host}:{args.port}/v1/margins")
        server.serve_forever()


if __name__ == "__main__":
    main()
