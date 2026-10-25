"""Compatibilidade da API histórica sobre o planeador transacional único."""

from __future__ import annotations

from typing import Any, Dict, Optional


def extract_text_content(content: Any) -> str:
    """Extrair texto público histórico, sem raciocínio nem blocos de ferramentas."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "\n".join(
            item["text"] for item in content
            if isinstance(item, dict) and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        ).strip()
    return ""


def public_itinerary_context(value: Any) -> list:
    """Projetar apenas cartões; excluir contactos, notas e evidências privadas."""
    days = value.get("days", value.get("itinerary", [])) if isinstance(value, dict) else value
    if not isinstance(days, list):
        return []
    result = []
    for day in days[:366]:
        if not isinstance(day, dict) or type(day.get("dayNumber")) is not int:
            continue
        source = day.get("items", [])
        if not isinstance(source, list):
            continue
        items = []
        for item in source[:20]:
            if not isinstance(item, dict):
                continue
            card = {
                key: item[key][:limit]
                for key, limit in (("id", 300), ("title", 200), ("time", 10))
                if isinstance(item.get(key), str)
            }
            card["locked"] = item.get("locked") is True
            confirmation = item.get("confirmation")
            card["confirmed"] = (
                isinstance(confirmation, dict)
                and confirmation.get("status") == "confirmed"
            )
            items.append(card)
        result.append({"dayNumber": day["dayNumber"], "items": items})
    return result


def chat_copilot(
    user_instruction: str,
    current_itinerary: Optional[Any] = None,
    brief: Optional[Any] = None,
    context: Optional[dict] = None,
    **kwargs,
) -> Dict[str, Any]:
    """Delegar no planeador transacional; nunca executar ferramentas de escrita."""
    del brief
    from blu_ai.planner import plan_actions

    safe_context = dict(context or {})
    safe_context.setdefault("conversationLanguage", "pt")
    if current_itinerary is not None:
        safe_context.setdefault("itinerary", public_itinerary_context(current_itinerary))
    return plan_actions(
        {"instruction": user_instruction, "context": safe_context},
        **kwargs,
    )


def curate_itinerary(*_args, **_kwargs):
    """Recusar geração autónoma sem versão-base e pré-visualização do portal."""
    raise RuntimeError(
        "A geração autónoma foi descontinuada; use o planeador transacional do portal."
    )
