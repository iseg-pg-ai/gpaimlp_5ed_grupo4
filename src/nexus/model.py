"""Modelo comercial canónico: uma oferta é uma forma de vender um produto BLU por um canal.

Validação estrita: campos desconhecidos, tipos errados, moedas ou datas inválidas recusam o
registo com o motivo; nada é convertido em silêncio. Desconhecido fica `None`, nunca zero.
O contrato publicado está em `schemas/offer.schema.json` (os testes mantêm-nos iguais).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re

CHANNELS = {
    "reseller": "Revenda por um parceiro (ex.: GetYourGuide); a BLU recebe comissão",
    "direct": "Fornecedor direto; a BLU compra ao custo e vende ao cliente",
    "own": "Parceiro próprio da BLU; custo e preço acordados",
}
UNITS = {"person", "group"}
# «from» é o preço «a partir de» de uma listagem: indicativo, nunca a base de uma decisão sozinho.
PRICE_BASES = {"quoted", "from"}
SOURCE_TYPES = {"api", "file"}

_CURRENCY = re.compile(r"^[A-Z]{3}$")
_KEY = re.compile(r"^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$")
_MONEY = re.compile(r"^\d{1,7}(?:\.\d{1,4})?$")
_RATE = re.compile(r"^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")

LINEAGE_FIELDS = ("source_id", "source_type", "ref", "contract", "ingested_at", "checksum")
FIELDS = {
    "offer_id": True, "product_key": True, "title": True, "channel": True, "source_id": True,
    "supplier_id": False, "supplier_name": False, "currency": True, "unit": True, "price_basis": True,
    "sell_price": True, "cost_price": False, "commission_rate": False, "min_pax": False,
    "valid_from": False, "valid_to": False, "lineage": True,
}


class ValidationError(ValueError):
    """Registo recusado: `errors` lista cada campo e o motivo."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def checksum(raw) -> str:
    """SHA-256 do registo de origem tal como chegou (JSON canónico), para a linhagem."""
    text = json.dumps(raw, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _text(value, field, errors, limit=200, required=True):
    if value is None or value == "":
        if required:
            errors.append(f"{field}: obrigatório")
        return None
    if not isinstance(value, str):
        errors.append(f"{field}: tem de ser texto")
        return None
    value = value.strip()
    if len(value) > limit:
        errors.append(f"{field}: mais de {limit} caracteres")
    return value


def _decimal(value, field, errors, pattern=_MONEY, required=True, hint="use ponto decimal, ex.: 90.50"):
    if value is None or value == "":
        if required:
            errors.append(f"{field}: obrigatório")
        return None
    if isinstance(value, bool):
        errors.append(f"{field}: tem de ser um número")
        return None
    text = str(value).strip()
    if not pattern.match(text):
        errors.append(f"{field}: valor inválido «{value}» ({hint})")
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        errors.append(f"{field}: valor inválido «{value}»")
        return None


def _date(value, field, errors):
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        errors.append(f"{field}: data inválida «{value}» (AAAA-MM-DD)")
        return None


def _lineage(value, errors):
    if not isinstance(value, dict):
        errors.append("lineage: obrigatória")
        return None
    unknown = sorted(set(value) - set(LINEAGE_FIELDS))
    if unknown:
        errors.append(f"lineage: campos desconhecidos {unknown}")
    for field in LINEAGE_FIELDS:
        if not value.get(field):
            errors.append(f"lineage.{field}: obrigatório")
    if value.get("source_type") and value["source_type"] not in SOURCE_TYPES:
        errors.append(f"lineage.source_type: tem de ser {sorted(SOURCE_TYPES)}")
    if value.get("checksum") and not _SHA256.match(str(value["checksum"])):
        errors.append("lineage.checksum: tem de ser SHA-256 em hexadecimal")
    if value.get("ingested_at"):
        try:
            datetime.fromisoformat(str(value["ingested_at"]).replace("Z", "+00:00"))
        except ValueError:
            errors.append("lineage.ingested_at: data e hora ISO 8601 inválida")
    return {field: value.get(field) for field in LINEAGE_FIELDS}


def validate_offer(raw: dict) -> dict:
    """Devolve a oferta canónica (valores monetários em Decimal) ou levanta ValidationError."""
    if not isinstance(raw, dict):
        raise ValidationError(["registo: tem de ser um objeto"])
    errors: list[str] = []
    unknown = sorted(set(raw) - set(FIELDS))
    if unknown:
        errors.append(f"campos desconhecidos: {unknown}")
    offer = {
        "offer_id": _text(raw.get("offer_id"), "offer_id", errors, 120),
        "product_key": _text(raw.get("product_key"), "product_key", errors, 80),
        "title": _text(raw.get("title"), "title", errors),
        "channel": raw.get("channel"),
        "source_id": _text(raw.get("source_id"), "source_id", errors, 40),
        "supplier_id": _text(raw.get("supplier_id"), "supplier_id", errors, 80, required=False),
        "supplier_name": _text(raw.get("supplier_name"), "supplier_name", errors, required=False),
        "currency": raw.get("currency"),
        "unit": raw.get("unit"),
        "price_basis": raw.get("price_basis"),
        "sell_price": _decimal(raw.get("sell_price"), "sell_price", errors),
        "cost_price": _decimal(raw.get("cost_price"), "cost_price", errors, required=False),
        "commission_rate": _decimal(raw.get("commission_rate"), "commission_rate", errors, _RATE, False, "entre 0 e 1, ex.: 0.08"),
        "min_pax": None,
        "valid_from": _date(raw.get("valid_from"), "valid_from", errors),
        "valid_to": _date(raw.get("valid_to"), "valid_to", errors),
        "lineage": _lineage(raw.get("lineage"), errors),
    }
    for field in ("product_key", "source_id"):
        if offer[field] and not _KEY.match(offer[field]):
            errors.append(f"{field}: só minúsculas, dígitos e - _ . : («{offer[field]}»)")
    if offer["channel"] not in CHANNELS:
        errors.append(f"channel: tem de ser {sorted(CHANNELS)}")
    if not isinstance(offer["currency"], str) or not _CURRENCY.match(offer["currency"]):
        errors.append("currency: código ISO 4217 em maiúsculas, ex.: EUR")
    if offer["unit"] not in UNITS:
        errors.append(f"unit: tem de ser {sorted(UNITS)}")
    if offer["price_basis"] not in PRICE_BASES:
        errors.append(f"price_basis: tem de ser {sorted(PRICE_BASES)}")
    min_pax = raw.get("min_pax")
    if min_pax not in (None, ""):
        if isinstance(min_pax, bool) or not re.fullmatch(r"\d{1,3}", str(min_pax)) or int(min_pax) < 1:
            errors.append("min_pax: inteiro a partir de 1")
        else:
            offer["min_pax"] = int(min_pax)
    if offer["valid_from"] and offer["valid_to"] and offer["valid_from"] > offer["valid_to"]:
        errors.append("valid_to: anterior a valid_from")
    # Na revenda a BLU não compra: ganha a comissão. Nos outros canais não há comissão.
    if offer["channel"] == "reseller" and offer["cost_price"] is not None:
        errors.append("cost_price: a revenda não tem custo para a BLU; use commission_rate")
    if offer["channel"] in ("direct", "own") and offer["commission_rate"] is not None:
        errors.append("commission_rate: só se aplica à revenda")
    if offer["lineage"] and offer["source_id"] and offer["lineage"]["source_id"] != offer["source_id"]:
        errors.append("lineage.source_id: diferente de source_id")
    if errors:
        raise ValidationError(errors)
    return offer


def to_json(offer: dict) -> dict:
    """Oferta para JSON: dinheiro como texto decimal (sem perdas), datas ISO."""
    out = {}
    for key, value in offer.items():
        if isinstance(value, Decimal):
            out[key] = format(value, "f")
        elif isinstance(value, date):
            out[key] = value.isoformat()
        else:
            out[key] = value
    return out
