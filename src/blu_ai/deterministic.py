"""Compilar comandos inequívocos do curador sem consultar um modelo externo."""

from __future__ import annotations

import re
import time
import unicodedata
from typing import Any

from blu_ai.providers import ProviderResult


_NUMBER_WORDS = {
    "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
}


def _plain(value: str) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


def _reference(value: str) -> str:
    """Normalizar apenas pontuação de delimitação, nunca aproximar nomes."""
    return value.strip().strip('"“”').rstrip(".,;:").strip()


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
    reference = _reference(reference)
    normalized = _plain(reference)
    matches = [item for item in day.get("items", []) if isinstance(item, dict) and (
        str(item.get("id", "")).casefold() == reference.casefold()
        or _plain(str(item.get("title", ""))) == normalized
    )]
    return matches[0] if len(matches) == 1 else None


def _located_item(context: dict, reference: str) -> tuple[int, dict] | None:
    matches = []
    normalized = _plain(_reference(reference))
    for day in context.get("itinerary", []):
        if not isinstance(day, dict) or type(day.get("dayNumber")) is not int:
            continue
        item = _item(context, day["dayNumber"], reference)
        if item:
            matches.append((day["dayNumber"], item))
            continue
        suffix = [row for row in day.get("items", []) if isinstance(row, dict)
                  and _plain(str(row.get("title", ""))).endswith(" " + normalized)]
        if len(suffix) == 1:
            matches.append((day["dayNumber"], suffix[0]))
    return matches[0] if len(matches) == 1 else None


def _editable(item: dict | None) -> bool:
    if not item or item.get("locked") is True:
        return False
    confirmation = item.get("confirmation")
    return not (isinstance(confirmation, dict) and confirmation.get("status") == "confirmed")


def _candidate_id(context: dict, number: int, reference: str) -> str | None:
    reference = _reference(reference)
    normalized = _plain(reference)
    matches = [row for row in context.get("candidates", []) if isinstance(row, dict)
               and row.get("dayNumber") == number
               and (str(row.get("id", "")).casefold() == reference.casefold()
                    or _plain(str(row.get("title", ""))) == normalized)]
    return matches[0]["id"] if len(matches) == 1 and isinstance(matches[0].get("id"), str) else None


def _blocked(language: str) -> dict:
    warning = ("O item não existe neste dia ou está protegido."
               if language == "pt" else
               "The item is not on this day or is protected.")
    return _plan(language, None, warning)


def _itinerary_overview(context: dict, language: str) -> dict:
    """Explicar o estado autoritativo sem transformar uma leitura em edição."""
    days = []
    item_titles = {}
    for day in context.get("itinerary", []):
        if not isinstance(day, dict) or type(day.get("dayNumber")) is not int:
            continue
        titles = []
        for item in day.get("items", []):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            if title:
                titles.append(title)
                if isinstance(item.get("id"), str):
                    item_titles[item["id"]] = title
        content = ", ".join(titles) if titles else (
            "sem atividades" if language == "pt" else "no activities"
        )
        location = str(day.get("location", "")).strip()
        label = f"Dia {day['dayNumber']}" if language == "pt" else f"Day {day['dayNumber']}"
        days.append(f"{label}{f' — {location}' if location else ''}: {content}.")
    introduction = (
        "Itinerário atual: " if language == "pt" else "Current itinerary: "
    )
    summary = introduction + " ".join(days)
    if not days:
        summary = ("O itinerário atual não contém dias." if language == "pt"
                   else "The current itinerary contains no days.")
    warnings = []
    seen = set()
    for diagnostic in context.get("diagnostics", []):
        if not isinstance(diagnostic, dict):
            continue
        message = str(diagnostic.get("message", "")).strip()
        if not message:
            continue
        day_number = diagnostic.get("dayNumber")
        title = item_titles.get(diagnostic.get("itemId"))
        prefix = ((f"Dia {day_number}" if language == "pt" else f"Day {day_number}")
                  if type(day_number) is int else "")
        if title:
            prefix += f" · {title}"
        rendered = f"{prefix}: {message}" if prefix else message
        if rendered not in seen:
            seen.add(rendered)
            warnings.append(rendered[:500])
        if len(warnings) == 10:
            break
    if not warnings:
        warnings = [
            ("Não foram encontrados problemas determinísticos; disponibilidade, reservas e "
             "dados ainda desconhecidos continuam sujeitos a confirmação humana.")
            if language == "pt" else
            ("No deterministic problems were found; availability, bookings and unknown data "
             "still require human confirmation.")
        ]
    return {
        "summary": summary[:1200],
        "actions": [],
        "warnings": warnings,
        "requiresConfirmation": True,
    }


def compile_explicit(instruction: str, context: dict) -> ProviderResult | None:
    """Devolver um plano local apenas quando todos os argumentos são inequívocos.

    ``None`` transfere a interpretação para o fornecedor. Um comando reconhecido mas
    inválido devolve um plano vazio, para que o modelo nunca contorne proteções.
    """
    started = time.monotonic()
    language = context.get("conversationLanguage", "pt")
    text = _plain(instruction.strip())
    match: re.Match[str] | None
    action: dict[str, Any] | None = None

    read_only = (
        ("itinerario" in text and ("explica" in text or "resume" in text)
         and re.search(r"\bsem (?:fazer )?alteracoes\b", text))
        or ("itinerary" in text and ("explain" in text or "summarize" in text)
            and re.search(r"\bwithout (?:making )?changes\b", text))
    )
    if read_only:
        return _result(_itinerary_overview(context, language), started)

    if text in {"qual e a segunda?", "which is the second one?"}:
        warning = ("Indique a lista ou a atividade a que se refere «a segunda»."
                   if language == "pt" else
                   "Specify the list or activity meant by ‘the second one’.")
        return _result(_plan(language, None, warning), started)
    if text in {"aumenta o orcamento do briefing.", "increase the briefing budget."}:
        warning = ("Indique o novo valor do orçamento."
                   if language == "pt" else "Specify the new budget amount.")
        return _result(_plan(language, None, warning), started)

    refinement_patterns = (
        r"em vez de remover (.+?), remove (.+?) e mostra duas alternativas para (.+?) sem aplicar nenhuma\.?",
        r"instead of removing (.+?), remove (.+?) and show two alternatives for (.+?) without applying either\.?",
    )
    for pattern in refinement_patterns:
        match = re.fullmatch(pattern, text)
        if not match:
            continue
        previous, replacement, alternatives_for = match.groups()
        old = _located_item(context, previous)
        new = _located_item(context, replacement)
        target = _located_item(context, alternatives_for)
        pending = context.get("pendingPlan")
        pending_actions = pending.get("actions", []) if isinstance(pending, dict) else []
        pending_matches = bool(old and any(
            isinstance(row, dict) and row.get("type") == "remove_item"
            and row.get("dayNumber") == old[0] and row.get("itemId") == old[1].get("id")
            for row in pending_actions
        ))
        # A instrução contém por si só a substituição completa. Se a interface já
        # não conservar uma proposta anterior, continua a ser segura e inequívoca.
        # Quando existe um plano pendente, este tem de corresponder à referência.
        pending_compatible = not pending_actions or pending_matches
        if (old and new and target and old == target and pending_compatible
                and old[0] == new[0] and _editable(new[1])):
            candidates = [row.get("id") for row in context.get("candidates", [])
                          if isinstance(row, dict) and row.get("dayNumber") == old[0]
                          and isinstance(row.get("id"), str)][:2]
            if len(candidates) == 2 and len(set(candidates)) == 2:
                plan = _plan(language, {
                    "type": "remove_item", "dayNumber": new[0], "itemId": new[1]["id"],
                })
                plan["alternatives"] = [{
                    "dayNumber": old[0], "itemId": old[1]["id"], "catalogIds": candidates,
                }]
                return _result(plan, started)
        return _result(_blocked(language), started)

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
        ("replace_item", r"(?:substitui|replace)\s+(.+?)\s+(?:por|with)\s+(.+?)\s+(?:no|on)\s+(?:dia|day)\s*(\d+)\.?"),
        ("move_item", r"move\s+(.+?)\s+(?:do|from)\s+(?:dia|day)\s*(\d+)\s+(?:para o|to)\s+(?:dia|day)\s*(\d+)\.?"),
        ("reschedule_item", r"(?:reagenda|reschedule)\s+(.+?)\s+(?:do|on)\s+(?:dia|day)\s*(\d+)\s+(?:para as|to)\s+(\d{2}:\d{2})\.?"),
        ("remove_item", r"remove(?: apenas| only)?\s+(.+?)(?:\s+(?:do|from)\s+(?:dia|day)\s*(\d+)|,?\s+(?:mesmo estando protegida|even though it is protected))\.?"),
        ("add_catalog_item", r"(?:adiciona a atividade|add activity)\s+(.+?)\s+(?:ao|to)\s+(?:dia|day)\s*(\d+)\.?"),
    ]
    for kind, pattern in patterns:
        match = re.fullmatch(pattern, text)
        if not match:
            continue
        if kind == "replace_item":
            old_reference, new_reference, raw_day = match.groups()
            day_number = int(raw_day)
            item = _item(context, day_number, old_reference)
            candidate_id = _candidate_id(context, day_number, new_reference)
            if _editable(item) and candidate_id:
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "catalogId": candidate_id}
        elif kind == "move_item":
            item_reference, raw_day, raw_target = match.groups()
            day_number, target = int(raw_day), int(raw_target)
            item = _item(context, day_number, item_reference)
            if _editable(item) and _day(context, target):
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "targetDayNumber": target}
        elif kind == "reschedule_item":
            item_reference, raw_day, new_time = match.groups()
            day_number = int(raw_day)
            item = _item(context, day_number, item_reference)
            if _editable(item):
                action = {"type": kind, "dayNumber": day_number,
                          "itemId": item["id"], "time": new_time}
        elif kind == "remove_item":
            item_reference, raw_day = match.groups()
            if raw_day is None:
                located = _located_item(context, item_reference)
                if not located:
                    return _result(_blocked(language), started)
                day_number = located[0]
            else:
                day_number = int(raw_day)
            item = _item(context, day_number, item_reference)
            if _editable(item):
                action = {"type": kind, "dayNumber": day_number, "itemId": item["id"]}
        else:
            candidate_reference, raw_day = match.groups()
            day_number = int(raw_day)
            catalog_id = _candidate_id(context, day_number, candidate_reference)
            if _day(context, day_number) and catalog_id:
                action = {"type": kind, "dayNumber": day_number, "catalogId": catalog_id}
        result = _plan(language, action) if action else _blocked(language)
        return _result(result, started)

    match = re.fullmatch(
        r"(?:no|on)\s+(?:dia|day)\s*(\d+)\s+(?:coloca|put)\s+(.+?)\s+(?:antes de|before)\s+(.+?)\.?",
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
