import type { Snapshot } from "./itinerary-pdf";
import type { Catalog } from "./curation.ts";
import { proposalBudget } from "./proposal-budget.ts";

export type ProposalDiagnostic = {
  code: string;
  severity: "warning" | "blocker";
  message: string;
  dayNumber?: number;
  itemId?: string;
};

const catalogIds = (catalog: Catalog) =>
  new Set(
    (["atracoes", "restaurantes", "experiencias"] as const).flatMap((table) =>
      catalog[table].map(
        (row) =>
          `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`,
      ),
    ),
  );

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-PT");

/** Qualidade do questionário, sem inferir respostas nem aplicar correções. */
export function briefQualityDiagnostics(snapshot: Snapshot): ProposalDiagnostic[] {
  const diagnostics: ProposalDiagnostic[] = [];
  const add = (code: string, message: string) =>
    diagnostics.push({ code, severity: "warning", message });
  const brief = snapshot.brief;
  if (brief.children > 0 && !(brief.childrenAges ?? "").trim())
    add("CHILD_AGES", "Faltam as idades das crianças.");
  if (!brief.arrivalLocation.trim() || (brief.arrivalFlightNumber?.trim() && !brief.arrivalTime))
    add(
      "ARRIVAL_INCOMPLETE",
      "Os dados de chegada estão incompletos; confirme local e, quando indicado, hora do voo.",
    );
  if (
    !brief.departureLocation.trim() ||
    (brief.departureFlightNumber?.trim() && !brief.departureTime)
  )
    add(
      "DEPARTURE_INCOMPLETE",
      "Os dados de partida estão incompletos; confirme local e, quando indicado, hora do voo.",
    );
  const exclusions = new Set(brief.exclusions.map(normalized).filter(Boolean));
  const conflicts = brief.interests.map(normalized).filter((value) => exclusions.has(value));
  if (conflicts.length)
    add(
      "INTEREST_EXCLUDED",
      "O mesmo tema surge como interesse e exclusão; é necessária uma escolha explícita.",
    );
  const vague = new Set(["outro", "outra", "outros", "outras", "sim", "restricao", "alergia"]);
  if (brief.mobilityRestrictions.some((value) => vague.has(normalized(value))))
    add("MOBILITY_DETAIL", "Uma restrição de mobilidade precisa de detalhe operacional.");
  if (brief.dietaryRestrictions.some((value) => vague.has(normalized(value))))
    add("DIETARY_DETAIL", "Uma restrição alimentar precisa de detalhe operacional.");
  if (brief.budget <= 0)
    add("BUDGET_MISSING", "Indique um orçamento positivo antes de avaliar a adequação.");
  return diagnostics;
}

/** Diagnóstico local e explicável; não consulta fornecedores nem altera o snapshot. */
export function proposalDiagnostics(snapshot: Snapshot, catalog: Catalog): ProposalDiagnostic[] {
  const diagnostics: ProposalDiagnostic[] = briefQualityDiagnostics(snapshot);
  const add = (
    code: string,
    severity: ProposalDiagnostic["severity"],
    message: string,
    dayNumber?: number,
    itemId?: string,
  ) => diagnostics.push({ code, severity, message, dayNumber, itemId });
  const approved = catalogIds(catalog);
  for (const day of snapshot.itinerary) {
    const count = day.items.filter((item) => item.category !== "free_time").length;
    const capacity =
      day.dailyCapacity ??
      (snapshot.brief.personalization?.extraBreaks || snapshot.brief.pace === "Relaxed"
        ? 2
        : snapshot.brief.pace === "Balanced"
          ? 3
          : 4);
    if (count > capacity)
      add(
        "CAPACITY",
        "blocker",
        `O dia contém ${count} atividades para uma capacidade de ${capacity}.`,
        day.dayNumber,
      );
    let previousEnd = 0;
    for (const item of day.items) {
      if (item.category === "free_time") continue;
      const time = item.time.match(/^(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/);
      if (!time)
        add("TIME_UNKNOWN", "warning", "Horário ou duração por validar.", day.dayNumber, item.id);
      else {
        const start = Number(time[1]) * 60 + Number(time[2]);
        if (start < previousEnd)
          add(
            "OVERLAP",
            "blocker",
            "Sobreposição com a atividade anterior.",
            day.dayNumber,
            item.id,
          );
        previousEnd = Number(time[3]) * 60 + Number(time[4]);
      }
      if (item.confirmation?.status !== "confirmed")
        add(
          "CONFIRMATION_PENDING",
          "warning",
          "Disponibilidade e reserva por confirmar.",
          day.dayNumber,
          item.id,
        );
      if (!approved.has(item.id))
        add(
          "CATALOG_UNAVAILABLE",
          "blocker",
          "O item não está disponível no catálogo aprovado atual.",
          day.dayNumber,
          item.id,
        );
    }
  }
  const budget = proposalBudget(snapshot);
  if (budget.incomplete) {
    add("PRICE_UNKNOWN", "warning", "Existem custos por confirmar.");
    add(
      "BUDGET_UNASSESSED",
      "warning",
      "Não é possível concluir a adequação do orçamento enquanto existirem custos desconhecidos.",
    );
  }
  for (const [currency, total] of Object.entries(budget.totals)) {
    if (currency !== snapshot.brief.currency)
      add(
        "CURRENCY",
        "warning",
        `Existem custos separados em ${currency}, sem conversão automática.`,
      );
    else if (
      total.confirmed + total.estimated >
      snapshot.brief.budget * 100 * (1 + (snapshot.brief.personalization?.budgetFlex ?? 0) / 100)
    )
      add("OVER_BUDGET", "blocker", "Os custos conhecidos excedem o orçamento autorizado.");
  }
  if (snapshot.pending.length)
    add("PENDING", "warning", `A proposta contém ${snapshot.pending.length} validações pendentes.`);
  return diagnostics;
}
