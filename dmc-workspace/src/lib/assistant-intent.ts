import type { AgentPlan } from "./assistant-actions.ts";

export type RequestIntent =
  | { kind: "add"; dayNumber: number; generic: boolean }
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
    ...new Set([...text.matchAll(/\b(?:dia|day)\s+(\d+)\b/g)].map((match) => Number(match[1]))),
  ];
  if (days.length !== 1) return { kind: "other" };
  const positive = text
    .replace(/nao (?:quero )?substituir/g, "")
    .replace(/(?:do not|don't|dont) (?:want to )?replace/g, "")
    .replace(/without replacing/g, "");
  if (
    /\b(adiciona|adicionar|adiconar|acrescenta|acrescentar|add|adding|include)\b/.test(positive) &&
    !/\b(substitui|substituir|troca|remove|remover|reorganiza|reagendar|capacidade|regenera|replace|delete|reorder|reschedule|capacity|regenerate|move)\b/.test(
      positive,
    )
  ) {
    return { kind: "add", dayNumber: days[0], generic: !/["“”]/.test(text) };
  }
  return { kind: "other" };
}

export function assertPlanIntent(plan: AgentPlan, intent: RequestIntent) {
  if (intent.kind !== "add") return;
  if (
    (plan.alternatives?.length ?? 0) ||
    plan.actions.some(
      (action) => action.type !== "add_catalog_item" || action.dayNumber !== intent.dayNumber,
    )
  )
    throw new IntentConflict(
      "O pedido é para adicionar; foi recusada uma substituição ou alteração diferente. / This request is to add; a replacement or other change was rejected.",
    );
}
