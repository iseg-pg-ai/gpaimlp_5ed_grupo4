"""Análise de margem e canibalização entre canais de parceria para o mesmo produto BLU.

Por produto e moeda (moedas diferentes nunca se comparam nem se somam), cada oferta válida na data
é avaliada para um grupo de `pax` pessoas:

- cliente paga: preço × pessoas (ou preço do grupo);
- receita da BLU: na revenda, comissão × o que o cliente paga; nos canais direto e próprio, o que
  o cliente paga;
- lucro: receita − custo (a revenda não tem custo para a BLU).

O melhor canal é o de maior valor no objetivo escolhido (receita ou lucro). Canibalização: quanto se
perde por venda quando outro canal vende em vez do melhor. Valores desconhecidos (sem comissão ou
sem custo) ficam fora da escolha e são indicados, nunca tratados como zero. Preços «a partir de»
entram mas ficam marcados como indicativos.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

OBJECTIVES = {"profit": "lucro", "revenue": "receita"}
CENT = Decimal("0.01")


def _money(value):
    return None if value is None else format(value.quantize(CENT, rounding=ROUND_HALF_UP), "f")


def evaluate(offer: dict, pax: int) -> dict:
    """Economia de uma oferta para `pax` pessoas, com o que falta para a calcular."""
    units = Decimal(pax) if offer["unit"] == "person" else Decimal(1)
    customer = offer["sell_price"] * units
    unknown, notes = [], []
    if offer["channel"] == "reseller":
        cost = Decimal(0)
        if offer["commission_rate"] is None:
            revenue = None
            unknown.append("commission_rate")
        else:
            revenue = customer * offer["commission_rate"]
    else:
        revenue = customer
        cost = None if offer["cost_price"] is None else offer["cost_price"] * units
        if cost is None:
            unknown.append("cost_price")
    profit = None if revenue is None or cost is None else revenue - cost
    eligible = offer["min_pax"] is None or pax >= offer["min_pax"]
    if not eligible:
        notes.append(f"mínimo de {offer['min_pax']} pessoas")
    if offer["price_basis"] == "from":
        notes.append("preço «a partir de»: indicativo")
    margin = None if profit is None or not customer else profit / customer
    return {
        "offer_id": offer["offer_id"], "channel": offer["channel"], "source_id": offer["source_id"],
        "supplier": offer["supplier_name"] or offer["supplier_id"], "title": offer["title"], "price_basis": offer["price_basis"],
        "customer_pays": _money(customer), "revenue": _money(revenue), "cost": _money(cost), "profit": _money(profit),
        "margin_pct": None if margin is None else float((margin * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
        "eligible": eligible, "unknown": unknown, "notes": notes, "lineage": offer["lineage"],
        "_value": {"profit": profit, "revenue": revenue},
    }


def analyse(offers: list[dict], *, objective: str = "profit", pax: int = 2, as_of: date | None = None, product_key: str | None = None) -> dict:
    if objective not in OBJECTIVES:
        raise ValueError(f"objective tem de ser {sorted(OBJECTIVES)}")
    if not isinstance(pax, int) or not 1 <= pax <= 100:
        raise ValueError("pax tem de ser um inteiro de 1 a 100")
    as_of = as_of or date.today()
    live = [offer for offer in offers
            if (offer["valid_from"] is None or offer["valid_from"] <= as_of) and (offer["valid_to"] is None or as_of <= offer["valid_to"])
            and (product_key is None or offer["product_key"] == product_key)]
    groups = defaultdict(list)
    for offer in live:
        groups[(offer["product_key"], offer["currency"])].append(offer)

    products = []
    for (key, currency), group in sorted(groups.items()):
        rows = [evaluate(offer, pax) for offer in group]
        ranked = sorted(rows, key=lambda row: (row["eligible"] and row["_value"][objective] is not None, row["_value"][objective] or Decimal(0)), reverse=True)
        best = next((row for row in ranked if row["eligible"] and row["_value"][objective] is not None), None)
        cannibalization = []
        if best:
            for row in ranked:
                value = row["_value"][objective]
                if row is best or value is None or not row["eligible"]:
                    continue
                loss = best["_value"][objective] - value
                if loss > 0:
                    cannibalization.append({
                        "offer_id": row["offer_id"], "channel": row["channel"], "instead_of": best["offer_id"],
                        "loss_per_sale": _money(loss),
                        "loss_pct": None if not best["_value"][objective] else float((loss / best["_value"][objective] * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
                        "message": f"Vender por {row['channel']} ({row['source_id']}) em vez de {best['channel']} ({best['source_id']}) perde {_money(loss)} {currency} de {OBJECTIVES[objective]} por venda.",
                    })
        for row in rows:
            row.pop("_value")
        products.append({
            "product_key": key, "currency": currency, "title": group[0]["title"], "channels": sorted({offer["channel"] for offer in group}),
            "best": None if not best else {"offer_id": best["offer_id"], "channel": best["channel"], "source_id": best["source_id"], objective: best[objective]},
            "undecided_reason": None if best else "nenhuma oferta elegível com valor conhecido (falta comissão ou custo)",
            "alternatives": ranked, "cannibalization": cannibalization,
        })
    return {"objective": objective, "pax": pax, "as_of": as_of.isoformat(), "products": products}
