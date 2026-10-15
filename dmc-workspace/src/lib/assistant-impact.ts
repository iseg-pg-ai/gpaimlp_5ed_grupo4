import { proposalBudget } from "./proposal-budget.ts";
import { canonicalSnapshot } from "./snapshot-validation.ts";
import type { Snapshot } from "./itinerary-pdf";

export type AgentImpact = {
  changes: string[];
  costs: Array<{
    currency: string;
    beforeCents: number;
    afterCents: number;
    beforeConfirmedCents: number;
    afterConfirmedCents: number;
  }>;
  pendingBefore: number;
  pendingAfter: number;
  incomplete: boolean;
};

// Derivado dos snapshots validados, nunca do resumo ou de preços do modelo.
export function proposalImpact(before: Snapshot, after: Snapshot): AgentImpact {
  const changes: string[] = [];
  for (const day of after.itinerary) {
    const previous = before.itinerary.find((d) => d.dayNumber === day.dayNumber);
    if (!previous) continue;
    const prefix = `Dia ${day.dayNumber}`;
    for (const item of previous.items)
      if (!day.items.some((next) => next.id === item.id))
        changes.push(`${prefix}: removida ${item.title}.`);
    for (const item of day.items) {
      const old = previous.items.find((candidate) => candidate.id === item.id);
      if (!old) {
        changes.push(`${prefix}: adicionada ${item.title} (${item.time}).`);
        continue;
      }
      if (old.time !== item.time)
        changes.push(`${prefix}: ${item.title}, horário ${old.time} → ${item.time}.`);
      const price = (value: typeof item) => ({
        note: value.priceNote,
        catalog: value.catalogDetails?.pricing,
        raw: value.catalogDetails?.price,
        confirmation: value.confirmation?.price,
        status: value.confirmation?.status,
      });
      if (canonicalSnapshot(price(old)) !== canonicalSnapshot(price(item)))
        changes.push(`${prefix}: condições de preço de ${item.title} alteradas.`);
    }
    const retainedBefore = previous.items.filter((item) => day.items.some((i) => i.id === item.id));
    const retainedAfter = day.items.filter((item) => previous.items.some((i) => i.id === item.id));
    if (retainedBefore.some((item, index) => item.id !== retainedAfter[index]?.id))
      changes.push(`${prefix}: ordem das atividades alterada.`);
    if (previous.dailyCapacity !== day.dailyCapacity)
      changes.push(
        `${prefix}: capacidade ${previous.dailyCapacity ?? "do briefing"} → ${day.dailyCapacity ?? "do briefing"}.`,
      );
    if (
      (previous.routeSummary && !day.routeSummary) ||
      previous.items.some(
        (item) => item.transitToNext && !day.items.find((i) => i.id === item.id)?.transitToNext,
      )
    )
      changes.push(`${prefix}: percursos anteriores invalidados; é necessária nova validação.`);
  }
  const oldBudget = proposalBudget(before);
  const newBudget = proposalBudget(after);
  return {
    changes,
    costs: [...new Set([...Object.keys(oldBudget.totals), ...Object.keys(newBudget.totals)])]
      .sort()
      .map((currency) => {
        const old = oldBudget.totals[currency];
        const next = newBudget.totals[currency];
        return {
          currency,
          beforeCents: (old?.confirmed ?? 0) + (old?.estimated ?? 0),
          afterCents: (next?.confirmed ?? 0) + (next?.estimated ?? 0),
          beforeConfirmedCents: old?.confirmed ?? 0,
          afterConfirmedCents: next?.confirmed ?? 0,
        };
      }),
    pendingBefore: oldBudget.lines.filter((line) => line.subtotalCents === null).length,
    pendingAfter: newBudget.lines.filter((line) => line.subtotalCents === null).length,
    incomplete: oldBudget.incomplete || newBudget.incomplete,
  };
}
