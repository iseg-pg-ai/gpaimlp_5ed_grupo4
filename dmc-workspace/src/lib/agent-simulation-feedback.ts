// Resume a simulação para revisão sem apresentar uma proposta como alteração já aplicada.
export type AgentSimulationFeedback = {
  code:
    | "PROTECTED_ITEM"
    | "UNKNOWN_DAY"
    | "UNKNOWN_ITEM"
    | "CAPACITY_EXCEEDED"
    | "BUDGET_EXCEEDED"
    | "SCHEDULE_CONFLICT"
    | "CATALOG_INELIGIBLE"
    | "INVALID_CONFIRMATION"
    | "INVALID_ACTION";
  instruction: string;
};

/**
 * Reduz uma falha determinística a um código seguro. O texto bruto pode conter
 * dados do catálogo ou do itinerário e nunca regressa ao fornecedor.
 */
export function simulationFeedback(error: unknown): AgentSimulationFeedback {
  const value = error instanceof Error ? error.message.toLocaleLowerCase("pt") : "";
  const feedback = (code: AgentSimulationFeedback["code"], instruction: string) => ({
    code,
    instruction,
  });
  if (/protegida|protegido|confirmad/.test(value))
    return feedback("PROTECTED_ITEM", "Preserva todos os itens protegidos ou confirmados.");
  if (/dia inexistente/.test(value))
    return feedback("UNKNOWN_DAY", "Usa apenas os dias devolvidos por get_itinerary.");
  if (/atividade inexistente|alvo/.test(value))
    return feedback("UNKNOWN_ITEM", "Usa apenas identificadores presentes no dia consultado.");
  if (/capacidade/.test(value))
    return feedback("CAPACITY_EXCEEDED", "Reduz a carga do dia ou pede esclarecimento.");
  if (/orçamento|custos conhecidos/.test(value))
    return feedback("BUDGET_EXCEEDED", "Não excedas o orçamento e não inventes preços.");
  if (/horário|sobrepos|viável|intervalo|encerrad/.test(value))
    return feedback(
      "SCHEDULE_CONFLICT",
      "Revê horários; se não houver solução, explica o impedimento.",
    );
  if (/catálogo|elegível|opç/.test(value))
    return feedback(
      "CATALOG_INELIGIBLE",
      "Escolhe apenas candidatos elegíveis devolvidos pela ferramenta.",
    );
  if (/confirmação|fornecedor|preço|local/.test(value))
    return feedback(
      "INVALID_CONFIRMATION",
      "Prepara apenas campos permitidos e fornecidos pelo utilizador.",
    );
  return feedback("INVALID_ACTION", "Retira a ação inválida ou pede um esclarecimento específico.");
}
