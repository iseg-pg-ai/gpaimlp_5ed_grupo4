"""Compilar comandos inequívocos do curador sem consultar um modelo externo."""

from __future__ import annotations

import re
import time
import unicodedata
from typing import Any

from blu_ai.providers import ProviderResult


_IDENTIFIER = r"[\w.-]+:[\w.-]+"
_NUMBER_WORDS = {
    "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
}


def _plain(value: str) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


def _plan(language: str, action: dict[str, Any] | None, warning: str = "") -> dict:
    changed = action is not None
    summary = {
        ("pt", True): "Alteração explícita preparada para revisão.",
        ("pt", False): "O pedido explícito não pode ser preparado com o estado atual.",
        ("en", True): "Explicit change prepared for review.",
        ("en", False): "The explicit request cannot be prepared from the current state.",
    }[(language, changed)]
    return {
        "summary": summary,
        "actions": [action] if action else [],
        "warnings": [warning] if warning else [],
        "requiresConfirmation": True,
    }


def _day(context: dict, number: int) -> dict | None:
    return next((day for day in context.get("itinerary", [])
                 if isinstance(day, dict) and day.get("dayNumber") == number), None)


def _item(context: dict, number: int, reference: str) -> dict | None:
    day = _day(context, number)
    if not day:
        return None
    reference = reference.strip().rstrip(".,;:")
    normalized = _plain(reference)
    matches = [item for item in day.get("items", []) if isinstance(item, dict) and (
        str(item.get("id", "")).casefold() == reference.casefold()
        or _plain(str(item.get("title", ""))) == normalized
    )]
    return matches[0] if len(matches) == 1 else None


def _editable(item: dict | None) -> bool:
    if not item or item.get("locked") is True:
        return False
    confirmation = item.get("confirmation")
    return not (isinstance(confirmation, dict) and confirmation.get("status") == "confirmed")


def _candidate(context: dict, number: int, identifier: str) -> bool:
    return any(isinstance(row, dict) and row.get("dayNumber") == number
               and row.get("id") == identifier for row in context.get("candidates", []))


def _blocked(language: str) -> dict:
    warning = ("O item não existe neste dia ou está protegido."
               if language == "pt" else
               "The item is not on this day or is protected.")
    return _plan(language, None, warning)


def compile_explicit(instruction: str, context: dict) -> ProviderResult | None:
    """Devolver um plano local apenas quando todos os argumentos são inequívocos.

    ``None`` transfere a interpretação para o fornecedor. Um comando reconhecido mas
    inválido devolve um plano vazio, para que o modelo nunca contorne proteções.
    """
    started = time.monotonic()
    language = context.get("conversationLanguage", "pt")
    text = _plain(instruction.strip())
    identifier = _IDENTIFIER
    match: re.Match[str] | None
    action: dict[str, Any] | None = None

    # Preparar uma confirmação é deliberadamente distinto de reagendar.
    match = re.fullmatch(
        r"(?:prepara o horario das|prepare)\s+(\d{2}:\d{2})\s+(?:para a atividade|for activity)\s+(.+?)"
        r",?\s+(?:sem confirmar a reserva|without confirming the booking)\.?", text,
    )
    if match:
        item = _item(context, 1, match.group(2))
        action = ({"type": "update_pending_confirmation", "dayNumber": 1,
                   "itemId": item["id"], "confirmationPatch": {"time": match.group(1)}}
                  if _editable(item) else None)
        result = _plan(language, action) if action else _blocked(language)
        return _result(result, started)

    patterns = [
        ("replace_item", rf"(?:substitui|replace)\s+({identifier})\s+(?:por|with)\s+({identifier})\s+(?:no|on)\s+(?:dia|day)\s*(\d+)\.?") ,
        ("move_item", rf"move\s+({identifier})\s+(?:do|from)\s+(?:dia|day)\s*(\d+)\s+(?:para o|to)\s+(?:dia|day)\s*(\d+)\.?") ,
        ("reschedule_item", rf"(?:reagenda|reschedule)\s+({identifier})\s+(?:do|on)\s+(?:dia|day)\s*(\d+)\s+(?:para as|to)\s+(\d{{2}}:\d{{2}})\.?") ,
        ("remove_item", rf"remove(?: apenas| only)?\s+({identifier})(?:\s+(?:do|from)\s+(?:dia|day)\s*(\d+)|,?\s+(?:mesmo estando protegida|even though it is protected))\.?") ,
        ("add_catalog_item", rf"(?:adiciona a atividade|add activity)\s+({identifier})\s+(?:ao|to)\s+(?:dia|day)\s*(\d+)\.?") ,
    ]
    for kind, pattern in patterns:
        match = re.fullmatch(pattern, text)
        if not match:
            continue
        if kind == "replace_item":
            old_id, new_id, raw_day = match.groups()
            day_number = int(raw_day)
            item = _item(context, day_number, old_id)
            if _editable(item) and _candidate(context, day_number, new_id):
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "catalogId": new_id}
        elif kind == "move_item":
            item_id, raw_day, raw_target = match.groups()
            day_number, target = int(raw_day), int(raw_target)
            item = _item(context, day_number, item_id)
            if _editable(item) and _day(context, target):
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "targetDayNumber": target}
        elif kind == "reschedule_item":
            item_id, raw_day, new_time = match.groups()
            day_number = int(raw_day)
            item = _item(context, day_number, item_id)
            if _editable(item):
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "time": new_time}
        elif kind == "remove_item":
            item_id, raw_day = match.groups()
            if raw_day is None:
                located = [(day.get("dayNumber"), item) for day in context.get("itinerary", [])
                           if isinstance(day, dict) for item in day.get("items", [])
                           if isinstance(item, dict) and item.get("id") == item_id]
                if len(located) != 1:
                    return _result(_blocked(language), started)
                day_number = located[0][0]
            else:
                day_number = int(raw_day)
            item = _item(context, day_number, item_id)
            if _editable(item):
                action = {"type": kind, "dayNumber": day_number, "itemId": item["id"]}
        else:
            catalog_id, raw_day = match.groups()
            day_number = int(raw_day)
            if _day(context, day_number) and _candidate(context, day_number, catalog_id):
                action = {"type": kind, "dayNumber": day_number, "catalogId": catalog_id}
        result = _plan(language, action) if action else _blocked(language)
        return _result(result, started)

    match = re.fullmatch(
        rf"(?:no|on)\s+(?:dia|day)\s*(\d+)\s+(?:coloca|put)\s+({identifier})\s+(?:antes de|before)\s+({identifier})\.?",
        text,
    )
    if match:
        day_number = int(match.group(1))
        first, second = (_item(context, day_number, value) for value in match.groups()[1:])
        if _editable(first) and _editable(second):
            current = _day(context, day_number) or {}
            requested = [first["id"], second["id"]]
            requested.extend(item["id"] for item in current.get("items", [])
                             if item.get("id") not in requested)
            action = {"type": "reorder_day", "dayNumber": day_number, "itemIds": requested}
        return _result(_plan(language, action) if action else _blocked(language), started)

    match = re.fullmatch(r"(?:define a capacidade do dia|set day)\s*(\d+)\s+(?:para|capacity to)\s+([a-z0-9]+)(?: atividades| activities)\.?", text)
    if match:
        day_number = int(match.group(1))
        capacity = int(match.group(2)) if match.group(2).isdigit() else _NUMBER_WORDS.get(match.group(2))
        if _day(context, day_number) and capacity and 1 <= capacity <= 6:
            action = {"type": "set_day_capacity", "dayNumber": day_number, "capacity": capacity}
        return _result(_plan(language, action) if action else _blocked(language), started)

    simple = [
        ("add_free_period", r"(?:deixa a (manha|tarde) livre no dia|leave the (morning|afternoon) free on day)\s*(\d+)\.?"),
        ("set_free_day", r"(?:marca o dia|make day)\s*(\d+)\s+(?:como dia livre|a free day)\.?"),
        ("optimize_route", r"(?:otimiza a sequencia geografica estimada do dia|optimize the estimated geographic order of day)\s*(\d+)\.?"),
        ("regenerate_day", r"(?:regenera apenas o dia|regenerate only day)\s*(\d+)(?:,? preservando os outros dias|,? preserving the other days)\.?"),
    ]
    for kind, pattern in simple:
        match = re.fullmatch(pattern, text)
        if not match:
            continue
        day_number = int(match.group(match.lastindex))
        if _day(context, day_number):
            action = {"type": kind, "dayNumber": day_number}
            if kind == "add_free_period":
                period = next(value for value in match.groups()[:-1] if value is not None)
                action["period"] = "morning" if period in {"manha", "morning"} else "afternoon"
        return _result(_plan(language, action) if action else _blocked(language), started)

    match = re.fullmatch(r"(?:aumenta o orcamento para|increase the budget to)(?: eur)?\s*(\d+)(?: eur)?\.?", text)
    if match:
        budget = int(match.group(1))
        action = {"type": "update_brief", "dayNumber": 1,
                  "briefPatch": {"budget": budget}}
        return _result(_plan(language, action), started)
    if re.fullmatch(r"(?:adiciona um item inventado fora do catalogo|add an invented item outside the catalogue)\.?", text):
        warning = ("Só podem ser usados itens aprovados do catálogo."
                   if language == "pt" else "Only approved catalogue items can be used.")
        return _result(_plan(language, None, warning), started)
    return None


def _result(plan: dict, started: float) -> ProviderResult:
    return ProviderResult(
        plan=plan,
        provider="deterministic",
        model_id="blu-explicit-intent-v1",
        latency_ms=round((time.monotonic() - started) * 1000),
    )
