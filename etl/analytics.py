"""KPI generation and transparent analytical scoring models for BLU records."""

from __future__ import annotations

from collections import Counter, defaultdict
from statistics import mean, median
from typing import Any


def build_analytics(tables: dict[str, list[dict[str, Any]]], validation_report: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, list[dict[str, Any]]]]:
    """Create descriptive KPIs and reproducible, rule-based model outputs."""
    attractions = tables.get("atracoes", [])
    restaurants = tables.get("restaurantes", [])
    experiences = tables.get("experiencias", [])
    prices = tables.get("precos", [])
    documents = tables.get("proposal_documents", [])
    pages = tables.get("proposal_pages", [])

    # KPI 1: catalogue breadth by source type and geographic coverage.
    cities = Counter(record.get("cidade") for record in attractions if record.get("cidade"))
    cities.update(record.get("cidade") for record in restaurants if record.get("cidade"))
    experience_categories = Counter(record.get("categoria") for record in experiences if record.get("categoria"))

    # KPI 2: price distribution, grouped by operational category.
    price_groups: dict[str, list[float]] = defaultdict(list)
    for record in prices:
        value = record.get("preco_referencia_eur")
        if isinstance(value, (int, float)):
            price_groups[record.get("categoria") or "Sem categoria"].append(float(value))
    price_summary = {
        category: {"count": len(values), "min_eur": min(values), "median_eur": median(values), "mean_eur": round(mean(values), 2), "max_eur": max(values)}
        for category, values in sorted(price_groups.items())
    }

    # KPI 3: proposal corpus size and extraction/search readiness.
    total_text = sum(record.get("text_characters", 0) for record in documents)
    kpis = {
        "catalog": {
            "attractions": len(attractions), "restaurants": len(restaurants), "experiences": len(experiences),
            "distinct_cities": len(cities), "records_by_city": dict(cities.most_common()),
            "experiences_by_category": dict(experience_categories.most_common()),
        },
        "pricing": {"priced_records": sum(len(values) for values in price_groups.values()), "by_category": price_summary},
        "proposals": {
            "documents": len(documents), "pages": len(pages), "total_text_characters": total_text,
            "average_pages_per_document": round(len(pages) / len(documents), 2) if documents else 0,
            "documents_with_email": sum(bool(record.get("emails")) for record in documents),
            "documents_with_price_mention": sum(bool(record.get("price_mentions")) for record in documents),
        },
        "data_quality": {"status": validation_report["status"], "issues": validation_report["issue_count"], "table_completeness_pct": {name: details["completeness_pct"] for name, details in validation_report["tables"].items()}},
    }

    # Model 1: catalog-readiness scores reward fields needed for itinerary curation.
    readiness_specs = {
        "atracoes": ["id", "cidade", "nome_da_atracao", "categoria", "descricao_curada", "horario", "necessidade_de_reserva", "preco_da_atracao"],
        "restaurantes": ["id_blu", "estabelecimento", "cidade", "morada", "tipo_gastronomia_base", "horario_base_reconfirmar"],
        "experiencias": ["nome_da_experiencia", "categoria", "localizacao", "descricao", "duracao", "preco", "fornecedor"],
    }
    readiness = []
    for table_name, fields in readiness_specs.items():
        for record in tables.get(table_name, []):
            completed = sum(record.get(field) is not None for field in fields)
            score = round(100 * completed / len(fields), 2)
            readiness.append({"table": table_name, "record_id": record.get(fields[0]), "readiness_score": score, "readiness_level": level(score), "completed_fields": completed, "expected_fields": len(fields)})

    # Model 2: proposal complexity estimates curation effort from transparent features.
    max_pages = max((record.get("page_count", 0) for record in documents), default=1) or 1
    max_text = max((record.get("text_characters", 0) for record in documents), default=1) or 1
    complexity = []
    for record in documents:
        score = 100 * (0.45 * record.get("page_count", 0) / max_pages + 0.45 * record.get("text_characters", 0) / max_text + 0.10 * min(len(record.get("price_mentions", [])), 5) / 5)
        complexity.append({"document_id": record["document_id"], "file_name": record["file_name"], "complexity_score": round(score, 2), "complexity_level": level(score), "page_count": record.get("page_count", 0), "text_characters": record.get("text_characters", 0), "price_mentions": len(record.get("price_mentions", []))})

    models = {
        "catalog_readiness": {"description": "Percent of itinerary-curation fields populated; no predictive assumptions.", "records": len(readiness)},
        "proposal_complexity": {"description": "45% page count, 45% text volume, 10% price-reference density; scores are normalized within this corpus.", "records": len(complexity)},
    }
    return kpis, models, {"model_catalog_readiness": readiness, "model_proposal_complexity": complexity}


def level(score: float) -> str:
    """Convert a 0-100 score into an easily filterable operational band."""
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    return "low"
