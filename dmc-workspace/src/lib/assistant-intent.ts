import { plannerContext, simulatePlan, type AgentPlan } from "./assistant-actions.ts";
import type { Snapshot } from "./itinerary-pdf";
import type { Catalog } from "./curation.ts";

export type RequestIntent =
  | { kind: "add" | "rank"; dayNumber: number; generic: boolean }
  | { kind: "other" };
export class IntentConflict extends Error {}
export function requestIntent(input: string): RequestIntent {
  const text = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const days = [
    ...new Set([...text.matchAll(/\bdia\s+(\d+)\b/g)].map((match) => Number(match[1]))),
  ];
  if (days.length !== 1) return { kind: "other" };
  const dayNumber = days[0];
  if (/^(ordena|ordenar|classifica|classificar)\b/.test(text) && /\bcandidatos\b/.test(text))
    return { kind: "rank", dayNumber, generic: false };
  const positive = text.replace(/nao quero substituir/g, "").replace(/nao substituir/g, "");
  if (
    /\b(adiciona|adicionar|adiconar|acrescenta|acrescentar)\b/.test(positive) &&
    !/\b(substitui|substituir|remove|remover|reorganiza|reagendar|capacidade|regenera)\b/.test(
      positive,
    )
  ) {
    const generic =
      /^(?:por favor[, ]+)?(?:nao quero substituir[, ]+quero )?(?:adiciona|adicionar|adiconar|acrescenta|acrescentar|quero adicionar) (?:mais )?(?:uma|1) atividade (?:no|ao) dia \d+[.!?]*$/.test(
        text,
      );
    return { kind: "add", dayNumber, generic };
  }
  return { kind: "other" };
}
export function assertPlanIntent(plan: AgentPlan, intent: RequestIntent) {
  if (intent.kind === "other") return;
  if (
    (plan.alternatives?.length ?? 0) > 0 ||
    plan.actions.some(
      (action) =>
        action.dayNumber !== intent.dayNumber ||
        intent.kind === "rank" ||
        action.type !== "add_catalog_item",
    ) ||
    plan.ranking?.some((group) => group.dayNumber !== intent.dayNumber)
  )
    throw new IntentConflict(
      intent.kind === "add"
        ? "O pedido é para adicionar. Foi recusada uma proposta de substituição ou de alteração diferente."
        : "O pedido é apenas para ordenar candidatos. Não são permitidas alterações ao roteiro.",
    );
}
export function additionChoices(
  snapshot: Snapshot,
  catalog: Catalog,
  dayNumber: number,
): AgentPlan {
  const empty = (summary: string, warnings: string[] = []): AgentPlan => ({
    summary,
    actions: [],
    warnings,
    requiresConfirmation: true,
  });
  const day = snapshot.itinerary.find((day) => day.dayNumber === dayNumber);
  if (!day) return empty(`O dia ${dayNumber} não existe nesta viagem.`);
  const limit =
    day.dailyCapacity ??
    (snapshot.brief.personalization?.extraBreaks || snapshot.brief.pace === "Relaxed"
      ? 2
      : snapshot.brief.pace === "Balanced"
        ? 3
        : 4);
  if (day.items.filter((item) => item.category !== "free_time").length >= limit)
    return empty(
      `O dia ${dayNumber} já atingiu a capacidade de ${limit} atividades. Para acrescentar outra sem substituir, é necessário rever explicitamente a capacidade diária. Nenhuma atividade foi substituída.`,
    );
  const candidates = plannerContext(snapshot, catalog).candidates.filter(
    (candidate) => candidate.dayNumber === dayNumber,
  );
  const choices: string[] = [];
  for (const candidate of candidates) {
    try {
      simulatePlan(
        snapshot,
        {
          ...empty("Pré-visualização de adição"),
          actions: [{ type: "add_catalog_item", dayNumber, catalogId: candidate.id }],
        },
        catalog,
      );
      choices.push(candidate.id);
    } catch {
      /* Não apresentar uma adição que as regras atuais recusam. */
    }
    if (choices.length === 3) break;
  }
  if (!choices.length)
    return empty(
      `Não encontrei uma atividade que possa ser acrescentada ao dia ${dayNumber} respeitando o catálogo, horários, deslocações e orçamento atuais. Nenhuma atividade foi substituída.`,
    );
  return {
    ...empty(
      `Escolha uma atividade para acrescentar ao dia ${dayNumber}. As atividades existentes serão preservadas; a escolha prepara uma pré-visualização de adição.`,
    ),
    ranking: [{ dayNumber, catalogIds: choices }],
  };
}
