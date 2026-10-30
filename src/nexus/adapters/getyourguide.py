"""Adaptador do contrato OpenAPI da GetYourGuide Partner API (getyourguide/partner-api-spec, 1.0.0).

Lê respostas guardadas de `GET /{version}/tours` e `POST /{version}/tours/{tour_id}/price-breakdown`
e devolve ofertas canónicas de revenda. Regras:

- Uma tour só entra num produto BLU por mapeamento explícito (`product_mapping`); sem mapeamento
  fica em `unmatched`, nunca se adivinha por título ou local.
- `retail_price` e `customer_base_price` são preços ao cliente; o que a BLU ganha é a comissão do
  acordo de parceria (`commission_rate` da fonte). Sem comissão conhecida, a margem fica desconhecida.
- O preço de `/tours` é «a partir de» (`price_basis: from`); o de `price-breakdown` é cotado para um
  dia (`quoted`), por pessoa: `retail_price` da categoria `adult` dividido pela quantidade pedida.
"""
from __future__ import annotations

from urllib.parse import parse_qs

from nexus.model import ValidationError, checksum, validate_offer

CONTRACT = "getyourguide/partner-api-spec@1.0.0"


def _currency_of(payload: dict) -> str:
    """A moeda vem do pedido (`currency=eur` em `_metadata.query`); a resposta de /tours não a repete."""
    query = (payload.get("_metadata") or {}).get("query") or ""
    values = parse_qs(query).get("currency") or []
    return values[0].upper() if values else ""


def _base(source: dict, product_key: str, ingested_at: str, ref: str, raw) -> dict:
    return {
        "product_key": product_key, "channel": "reseller", "source_id": source["id"],
        "commission_rate": source.get("commission_rate"),
        "lineage": {"source_id": source["id"], "source_type": "api", "ref": ref, "contract": CONTRACT, "ingested_at": ingested_at, "checksum": checksum(raw)},
        "supplier_id": None,
    }


def tours_to_offers(payload: dict, *, source: dict, mapping: dict, ingested_at: str, ref: str = "GET /1/tours"):
    """Ofertas indicativas («a partir de») de uma resposta de /tours. Devolve (ofertas, recusadas, sem_mapeamento)."""
    offers, rejected, unmatched = [], [], []
    tours = ((payload or {}).get("data") or {}).get("tours")
    if not isinstance(tours, list):
        return [], [{"ref": ref, "errors": ["resposta sem data.tours"]}], []
    currency = _currency_of(payload)
    for index, tour in enumerate(tours):
        tour_ref = f"{ref}#data.tours[{index}]"
        tour_id = tour.get("tour_id") if isinstance(tour, dict) else None
        product_key = mapping.get(str(tour_id)) if tour_id is not None else None
        if not product_key:
            unmatched.append({"ref": tour_ref, "tour_id": tour_id, "title": (tour or {}).get("title"), "reason": "sem mapeamento para um produto BLU"})
            continue
        price = tour.get("price") or {}
        amount = (price.get("values") or {}).get("amount")
        unit = "group" if "group" in str(price.get("description") or "").lower() else "person"
        raw = {**_base(source, product_key, ingested_at, tour_ref, tour),
               "offer_id": f"{source['id']}:{tour_id}", "title": tour.get("title"), "currency": currency,
               "unit": unit, "price_basis": "from", "sell_price": amount,
               "supplier_id": None if tour.get("supplier_id") is None else str(tour.get("supplier_id"))}
        try:
            offers.append(validate_offer(raw))
        except ValidationError as error:
            rejected.append({"ref": tour_ref, "errors": error.errors})
    return offers, rejected, unmatched


def price_breakdown_to_offers(payload: dict, *, tour_id, title: str, source: dict, mapping: dict, ingested_at: str, ref: str | None = None):
    """Ofertas cotadas por dia e opção de uma resposta de price-breakdown. Devolve (ofertas, recusadas, sem_mapeamento)."""
    ref = ref or f"POST /1/tours/{tour_id}/price-breakdown"
    product_key = mapping.get(str(tour_id))
    if not product_key:
        return [], [], [{"ref": ref, "tour_id": tour_id, "title": title, "reason": "sem mapeamento para um produto BLU"}]
    options = (payload or {}).get("tour_options")
    if not isinstance(options, list):
        return [], [{"ref": ref, "errors": ["resposta sem tour_options"]}], []
    offers, rejected = [], []
    for o_index, option in enumerate(options):
        for s_index, slot in enumerate(option.get("time_slots") or []):
            slot_ref = f"{ref}#tour_options[{o_index}].time_slots[{s_index}]"
            breakdown = slot.get("price_breakdown") or {}
            adult = next((item for item in breakdown.get("individuals") or [] if item.get("ticket_category") == "adult"), None)
            if not adult:
                rejected.append({"ref": slot_ref, "errors": ["sem preço da categoria adult"]})
                continue
            quantity = adult.get("quantity")
            price = adult.get("price") or {}
            retail = price.get("retail_price")
            if not isinstance(quantity, int) or quantity < 1 or not isinstance(retail, (int, float)) or isinstance(retail, bool):
                rejected.append({"ref": slot_ref, "errors": ["quantity ou retail_price inválidos"]})
                continue
            day = str(slot.get("date_time") or "")[:10]
            raw = {**_base(source, product_key, ingested_at, slot_ref, slot),
                   "offer_id": f"{source['id']}:{tour_id}:{option.get('option_id')}:{day}", "title": title,
                   "currency": str(price.get("currency") or "").upper(), "unit": "person", "price_basis": "quoted",
                   "sell_price": f"{retail / quantity:.2f}", "min_pax": slot.get("min_participants"),
                   "valid_from": day or None, "valid_to": day or None}
            try:
                offers.append(validate_offer(raw))
            except ValidationError as error:
                rejected.append({"ref": slot_ref, "errors": error.errors})
    return offers, rejected, []
