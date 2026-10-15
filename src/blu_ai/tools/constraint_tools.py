"""LangChain Tool for verifying business constraints and Responsible AI safety guardrails."""

from __future__ import annotations

import re
from typing import List, Dict, Any, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field


class ConstraintCheckParams(BaseModel):
    activity_title: str = Field(description="Título ou nome da atividade/restaurante")
    activity_description: str = Field(description="Descrição da atividade ou detalhes do local")
    mobility_restrictions: List[str] = Field(default_factory=list, description="Lista de restrições de mobilidade do cliente (ex: ['cadeira de rodas', 'sem escadas íngremes'])")
    dietary_restrictions: List[str] = Field(default_factory=list, description="Restrições alimentares (ex: ['sem glúten', 'vegetariano', 'alergia a marisco'])")
    max_physical_effort: str = Field(default="Moderado", description="'Baixo', 'Moderado' ou 'Alto'")
    exclusions: List[str] = Field(default_factory=list, description="Interesses expressamente excluídos pelo cliente")


@tool("validate_activity_constraints", args_schema=ConstraintCheckParams)
def validate_activity_constraints(
    activity_title: str,
    activity_description: str,
    mobility_restrictions: List[str] = [],
    dietary_restrictions: List[str] = [],
    max_physical_effort: str = "Moderado",
    exclusions: List[str] = []
) -> Dict[str, Any]:
    """Valida se uma atividade específica respeita rigorosamente as restrições e regras do cliente.
    Verifica barreiras arquitetónicas (escadas, colinas), restrições alimentares, esforço físico e exclusões.
    """
    text_content = f"{activity_title} {activity_description}".lower()
    violations: List[str] = []
    warnings: List[str] = []

    # 1. Validação de Mobilidade
    if mobility_restrictions:
        steep_indicators = ["escadaria", "subida íngreme", "íngreme", "piso irregular", "calçada escorregadia", "acesso difícil a pé"]
        for ind in steep_indicators:
            if ind in text_content:
                violations.append(f"Violação de mobilidade: detetado '{ind}' incompatível com {mobility_restrictions}")

    # 2. Validação de Esforço Físico
    if "baixo" in max_physical_effort.lower():
        high_effort_words = ["caminhada longa", "trekking", "escalada", "btt", "esforço elevado", "subida a pé"]
        for w in high_effort_words:
            if w in text_content:
                violations.append(f"Esforço excessivo: '{w}' excede o nível 'Baixo' solicitado.")

    # 3. Validação de Exclusões
    for excl in exclusions:
        if excl.lower() in text_content:
            violations.append(f"Exclusão violada: '{excl}' foi expressamente excluído pelo cliente.")

    # 4. Validação de Restrições Alimentares
    if dietary_restrictions:
        # Se for restaurante ou gastronómico, emitir aviso de verificação de menu
        if any(term in text_content for term in ["gastronomia", "degustação", "restaurante", "prova", "jantar", "almoço"]):
            warnings.append(f"Exige verificação prévia com o estabelecimento para: {', '.join(dietary_restrictions)}")

    passed = len(violations) == 0

    return {
        "passed": passed,
        "violations": violations,
        "warnings": warnings,
        "recommendation": "Aprovado para inclusão na proposta" if passed else "Rejeitado; selecionar alternativa do catálogo",
        "human_review_required": len(warnings) > 0
    }
