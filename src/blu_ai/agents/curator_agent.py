"""Curator Agent implementation using LangChain and LangGraph."""

from __future__ import annotations

import json
from typing import Dict, Any, List, Optional
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, SystemMessage

from blu_ai.llm import get_llm
from blu_ai.tools.catalog_tools import search_blu_catalog
from blu_ai.tools.weather_tools import get_weather_forecast
from blu_ai.tools.constraint_tools import validate_activity_constraints
from blu_ai.schemas.brief import CustomerBrief
from blu_ai.agents.prompts import CURATOR_SYSTEM_PROMPT


AVAILABLE_TOOLS = [
    search_blu_catalog,
    get_weather_forecast,
    validate_activity_constraints,
]


def build_curator_agent(model_id: Optional[str] = None, temperature: Optional[float] = None):
    """Constrói e devolve o Agente ReAct LangGraph equipado com as ferramentas BLU."""
    llm = get_llm(model_id=model_id, temperature=temperature)
    agent = create_react_agent(
        model=llm,
        tools=AVAILABLE_TOOLS,
        prompt=CURATOR_SYSTEM_PROMPT,
    )
    return agent


def curate_itinerary(brief: CustomerBrief) -> Dict[str, Any]:
    """Executa o agente para conceber uma proposta de itinerário completa para um briefing."""
    agent = build_curator_agent()

    user_prompt = f"""
Por favor, constrói uma proposta de itinerário para o seguinte cliente da BLU Coast:
- Nome do Cliente: {brief.customerName}
- Destino: {brief.destination}
- Datas: {brief.startDate} a {brief.endDate}
- Participantes: {brief.adults} adultos, {brief.children} crianças
- Orçamento Disponível: {brief.budget} {brief.currency}
- Nível da Proposta: {brief.proposalTier}
- Ritmo Desejado: {brief.pace}
- Esforço Físico Máximo: {brief.physicalEffort}
- Preferência de Início: {brief.morningPreference}
- Ritmo de Refeições: {brief.diningPace}
- Interesses Principais: {', '.join(brief.interests) if brief.interests else 'Cultura e Gastronomia'}
- Atividades a Evitar / Exclusões: {', '.join(brief.exclusions) if brief.exclusions else 'Nenhuma'}
- Restrições de Mobilidade: {', '.join(brief.mobilityRestrictions) if brief.mobilityRestrictions else 'Nenhuma'}
- Restrições Alimentares: {', '.join(brief.dietaryRestrictions) if brief.dietaryRestrictions else 'Nenhuma'}

Passos requeridos:
1. Consulta a meteorologia para as datas em {brief.destination}.
2. Pesquisa atividades e restaurantes elegíveis no catálogo da BLU Coast usando as ferramentas.
3. Valida se as atividades respeitam as restrições com a ferramenta de validação.
4. Constrói o plano dia a dia com horários recomendados (manhã, almoço, tarde, jantar).
5. Explica as regras BLU aplicadas e sinaliza quaisquer pendências para o curador humano.
"""

    inputs = {"messages": [HumanMessage(content=user_prompt)]}
    result = agent.invoke(inputs)

    # Extrair mensagens finais e chamadas de ferramentas
    messages = result.get("messages", [])
    final_response = extract_text_content(messages[-1].content if messages else "")

    # Recolha de auditoria das ferramentas chamadas durante o raciocínio
    tool_calls_executed = []
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_calls_executed.append({
                    "tool": tc.get("name"),
                    "args": tc.get("args")
                })

    return {
        "status": "success",
        "brief_customer": brief.customerName,
        "destination": brief.destination,
        "response": final_response,
        "audit_trail": {
            "total_steps": len(messages),
            "tool_calls": tool_calls_executed,
            "tools_used_count": len(tool_calls_executed)
        }
    }


def extract_text_content(content: Any) -> str:
    """Extrai texto limpo de strings ou blocos de conteúdo estruturados (ex: reasoning/text do Bedrock)."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and "text" in item:
                    parts.append(item["text"])
                elif item.get("type") == "reasoning_content" and "reasoning_content" in item:
                    rc = item["reasoning_content"]
                    if isinstance(rc, dict) and "text" in rc:
                        parts.append(f"> *Raciocínio:* {rc['text']}\n")
                elif "text" in item:
                    parts.append(str(item["text"]))
            else:
                parts.append(str(item))
        return "\n".join(parts).strip()
    return str(content).strip()


def chat_copilot(
    user_instruction: str,
    current_itinerary: Optional[Any] = None,
    brief: Optional[Any] = None
) -> Dict[str, Any]:
    """Co-Pilot interativo para assistência em linguagem natural e alterações em tempo real."""
    agent = build_curator_agent()

    context = ""
    if brief:
        if isinstance(brief, dict):
            c_name = brief.get("customerName", "Cliente")
            dest = brief.get("destination", "Portugal")
            pace = brief.get("pace", "Balanced")
            tier = brief.get("proposalTier", "Classic")
            morning = brief.get("morningPreference", "Standard (09:30)")
            dining = brief.get("diningPace", "Relaxed Dining (~90m)")
            effort = brief.get("physicalEffort", "Moderado (Moderate)")
            interests = brief.get("interests", [])
            exclusions = brief.get("exclusions", [])
            mob = brief.get("mobilityRestrictions", [])
            diet = brief.get("dietaryRestrictions", [])
        else:
            c_name = getattr(brief, "customerName", "Cliente")
            dest = getattr(brief, "destination", "Portugal")
            pace = getattr(brief, "pace", "Balanced")
            tier = getattr(brief, "proposalTier", "Classic")
            morning = getattr(brief, "morningPreference", "Standard (09:30)")
            dining = getattr(brief, "diningPace", "Relaxed Dining (~90m)")
            effort = getattr(brief, "physicalEffort", "Moderado (Moderate)")
            interests = getattr(brief, "interests", [])
            exclusions = getattr(brief, "exclusions", [])
            mob = getattr(brief, "mobilityRestrictions", [])
            diet = getattr(brief, "dietaryRestrictions", [])

        context += (
            f"=== PERFIL & RESTRIÇÕES DO CLIENTE ===\n"
            f"- Cliente: {c_name} | Destino: {dest} | Tier: {tier}\n"
            f"- Ritmo: {pace} (Máximo 3 atividades/dia para Relaxed, 4 para Balanced)\n"
            f"- Início Matinal: {morning} | Ritmo de Refeições: {dining}\n"
            f"- Esforço Físico Máximo: {effort}\n"
            f"- Interesses: {', '.join(interests) if interests else 'Cultura e Gastronomia'}\n"
            f"- Exclusões Expressas: {', '.join(exclusions) if exclusions else 'Nenhuma'}\n"
            f"- Restrições de Mobilidade: {', '.join(mob) if mob else 'Nenhuma'}\n"
            f"- Restrições Alimentares / Alergias: {', '.join(diet) if diet else 'Nenhuma'}\n"
        )

    if current_itinerary:
        context += f"\nItinerário atual em edição: {json.dumps(current_itinerary, ensure_ascii=False)[:1000]}...\n"

    prompt = f"""
{context}
Instrução do Consultor:
"{user_instruction}"

DIRETRIZES ESTRITAS DE EXECUÇÃO:
1. Respeita a CADÊNCIA DA BLU COAST: Máximo 3 a 4 paragens no dia (1 atividade manhã, 1 almoço, 1 atividade tarde, 1 jantar). NUNCA agendes 2 jantares ou refeições duplicadas!
2. Respeita a preferência de início ({morning if brief else '10:00'}).
3. Coerência geográfica: Mantém as atividades nos mesmos bairros ou bairros adjacentes (evita deslocações caóticas na cidade).
4. Usa a ferramenta `search_blu_catalog` para selecionar opções reais do catálogo BLU Coast.
5. Apresenta o resultado estruturado com: Diagnóstico Curatorial, Proposta do Dia e Salvaguarda de Regras BLU.
"""

    inputs = {"messages": [HumanMessage(content=prompt)]}
    result = agent.invoke(inputs)
    messages = result.get("messages", [])
    raw_content = messages[-1].content if messages else ""
    final_reply = extract_text_content(raw_content)

    return {
        "reply": final_reply,
        "messages_count": len(messages)
    }
