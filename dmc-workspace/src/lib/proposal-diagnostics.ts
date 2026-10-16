import type { Snapshot } from "./itinerary-pdf";
import type { Catalog } from "./curation.ts";
import type { DayWeatherResult } from "./weather.ts";
import { proposalBudget } from "./proposal-budget.ts";
import { closureState } from "./itinerary-scheduling.ts";

export type Diagnostic = {
  code: string;
  severity: "warning" | "blocker";
  dayNumber?: number;
  itemId?: string;
  message: string;
  source: string;
};
export function proposalDiagnostics(
  snapshot: Snapshot,
  catalog?: Catalog,
  weather: Record<number, DayWeatherResult> = {},
): Diagnostic[] {
  const alerts: Diagnostic[] = [];
  const add = (
    code: string,
    message: string,
    dayNumber?: number,
    itemId?: string,
    severity: Diagnostic["severity"] = "warning",
    source = "Snapshot guardado",
  ) => alerts.push({ code, message, dayNumber, itemId, severity, source });
  const brief = snapshot.brief;
  if (brief.children > 0 && !(brief.childrenAges ?? "").trim())
    add("CHILD_AGES", "Faltam as idades das crianças.");
  if (brief.budget <= 0) add("BUDGET", "O orçamento necessita de esclarecimento.");
  for (const day of snapshot.itinerary) {
    const count = day.items.filter((item) => item.category !== "free_time").length;
    const limit =
      day.dailyCapacity ??
      (brief.personalization?.extraBreaks || brief.pace === "Relaxed"
        ? 2
        : brief.pace === "Balanced"
          ? 3
          : 4);
    if (count > limit)
      add(
        "CAPACITY",
        `Dia ${day.dayNumber}: ${count} atividades excedem a capacidade ${limit}.`,
        day.dayNumber,
        undefined,
        "blocker",
      );
    let end = 0;
    for (const item of day.items) {
      const match = item.time.match(/^(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/);
      if (!match)
        add(
          "TIME_UNKNOWN",
          `${item.title}: horário ou duração por validar.`,
          day.dayNumber,
          item.id,
        );
      else {
        const start = +match[1] * 60 + +match[2];
        if (start < end)
          add(
            "OVERLAP",
            `${item.title}: sobreposição com a atividade anterior.`,
            day.dayNumber,
            item.id,
            "blocker",
          );
        end = +match[3] * 60 + +match[4];
        const minutes = item.transitToNext?.duration.match(/^(\d+) min$/);
        if (minutes) end += +minutes[1] + (item.transitToNext?.bufferMinutes ?? 0);
      }
      if (item.category !== "free_time" && item.confirmation?.status !== "confirmed")
        add(
          "RESERVATION",
          `${item.title}: disponibilidade e reserva por confirmar.`,
          day.dayNumber,
          item.id,
        );
      if (item.transitToNext && !item.transitToNext.isAlgorithmOptimized)
        add(
          "ROUTE_ESTIMATE",
          `${item.title}: deslocação estimada, não comprovada.`,
          day.dayNumber,
          item.id,
          "warning",
          "Adaptador de rotas",
        );
      const record = catalog
        ? (["atracoes", "restaurantes", "experiencias"] as const).flatMap((table) =>
            catalog[table].filter(
              (row) =>
                item.id ===
                `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`,
            ),
          )[0]
        : undefined;
      if (catalog && item.category !== "free_time" && !record)
        add(
          "CATALOG_UNAVAILABLE",
          `${item.title}: registo não disponível no catálogo aprovado atual.`,
          day.dayNumber,
          item.id,
          "blocker",
          "Catálogo aprovado",
        );
      const closed = record
        ? String(record.dias_de_encerramento ?? record.encerramento_base_reconfirmar ?? "")
        : "";
      if (closed && closureState(closed, day.date) === "closed")
        add(
          "CLOSED",
          `${item.title}: encerramento indicado para esta data.`,
          day.dayNumber,
          item.id,
          "blocker",
          "Catálogo aprovado",
        );
      const forecast = weather[day.dayNumber];
      if (forecast?.status === "available" && forecast.weather.isRainy)
        add(
          forecast.weather.isHistorical ? "HISTORICAL_RAIN" : "RAIN",
          `${item.title}: ${forecast.weather.isHistorical ? "referência histórica de chuva; não é previsão" : "previsão de chuva; rever atividades exteriores"}.`,
          day.dayNumber,
          item.id,
          "warning",
          forecast.weather.sourceUrl,
        );
    }
  }
  const budget = proposalBudget(snapshot);
  if (budget.incomplete)
    add("PRICE_UNKNOWN", "Há custos por confirmar; o total final não está validado.");
  for (const [currency, total] of Object.entries(budget.totals)) {
    if (currency !== brief.currency)
      add(
        "CURRENCY",
        `Custos em ${currency} separados do orçamento em ${brief.currency}; sem conversão automática.`,
      );
    else if (
      total.confirmed + total.estimated >
      brief.budget * 100 * (1 + (brief.personalization?.budgetFlex ?? 0) / 100)
    )
      add(
        "OVER_BUDGET",
        `Os custos conhecidos em ${currency} excedem o orçamento autorizado.`,
        undefined,
        undefined,
        "blocker",
      );
  }
  for (const pending of snapshot.pending) add("PENDING", pending);
  return alerts;
}
