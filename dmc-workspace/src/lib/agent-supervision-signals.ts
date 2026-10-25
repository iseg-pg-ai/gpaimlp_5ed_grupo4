import { closureState } from "./itinerary-scheduling.ts";
import { norm, type Catalog } from "./curation.ts";
import type { Snapshot } from "./itinerary-pdf.ts";

type WeatherObservation = { dayNumber: number; isRainy: boolean; evidence: string };
export type AgentSupervisionSignal = {
  code: string;
  evidence: "observed" | "historical_reference" | "user_reported" | "review_required";
  dayNumber?: number;
  catalogIds?: string[];
};

const rowId = (table: string, row: Record<string, unknown>) =>
  `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`;
const value = (row: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => String(row[key] ?? "").trim()).find(Boolean) ?? "";

/** Sinais conservadores: pedem revisão e nunca constituem confirmação operacional. */
export function agentSupervisionSignals(
  snapshot: Snapshot,
  catalog: Catalog,
  weather: WeatherObservation[],
  instruction: string,
): AgentSupervisionSignal[] {
  const signals: AgentSupervisionSignal[] = weather
    .filter((item) => item.isRainy)
    .map((item) => ({
      code: "RAIN_REVIEW",
      dayNumber: item.dayNumber,
      evidence: item.evidence === "forecast" ? "observed" : "historical_reference",
    }));
  const rows = (["atracoes", "restaurantes", "experiencias"] as const).flatMap((table) =>
    catalog[table].map((row) => ({ table, row, id: rowId(table, row) })),
  );
  const byId = new Map(rows.map((entry) => [entry.id, entry]));
  const currentIds = new Set(snapshot.itinerary.flatMap((day) => day.items.map((item) => item.id)));
  for (const day of snapshot.itinerary)
    for (const item of day.items) {
      const entry = byId.get(item.id);
      if (!entry) continue;
      const closures = value(entry.row, "dias_de_encerramento", "encerramento_base_reconfirmar");
      const state = closureState(closures, day.date);
      if (state === "closed")
        signals.push({
          code: "CATALOG_CLOSED_ON_DATE",
          evidence: "observed",
          dayNumber: day.dayNumber,
          catalogIds: [item.id],
        });
      const description = value(entry.row, "descricao_curada", "descricao", "observacoes_da_base");
      const required = [description, value(entry.row, "site_fonte"), value(entry.row, "horario")];
      if (required.some((field) => !field))
        signals.push({
          code: "CONTENT_FIELDS_MISSING",
          evidence: "review_required",
          catalogIds: [item.id],
        });
      const tripYear = Number(day.date.slice(0, 4));
      const mentionedYears = description.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) ?? [];
      if (mentionedYears.some((year) => year < tripYear))
        signals.push({
          code: "CONTENT_DATE_MAY_BE_STALE",
          evidence: "review_required",
          catalogIds: [item.id],
        });
      if (
        /\b(the|and|with|from)\b/i.test(description) &&
        /\b(o|a|de|com|para|uma)\b/i.test(description)
      )
        signals.push({
          code: "CONTENT_LANGUAGE_MIXED",
          evidence: "review_required",
          catalogIds: [item.id],
        });
    }
  const duplicates = new Map<string, string[]>();
  for (const entry of rows) {
    const key = `${norm(value(entry.row, "nome_da_atracao", "estabelecimento", "nome_da_experiencia"))}|${norm(value(entry.row, "cidade", "localizacao"))}`;
    if (key !== "|") duplicates.set(key, [...(duplicates.get(key) ?? []), entry.id]);
  }
  for (const ids of duplicates.values())
    if (ids.length > 1 && ids.some((id) => currentIds.has(id)))
      signals.push({
        code: "CONTENT_POSSIBLE_DUPLICATE",
        evidence: "review_required",
        catalogIds: ids.slice(0, 10),
      });
  const text = norm(instruction);
  for (const [code, pattern] of [
    ["DELAY_REPORTED", /\b(atras|delay|late)\w*/],
    ["CANCELLATION_REPORTED", /\b(cancel|cancelad|cancelled)\w*/],
    ["CLOSURE_REPORTED", /\b(encerr|fechad|closed)\w*/],
    [
      "SCHEDULE_CHANGE_REPORTED",
      /\b(mudanc|alteracao|change)\w*.{0,20}\b(horario|schedule|time)\w*/,
    ],
  ] as const)
    if (pattern.test(text)) signals.push({ code, evidence: "user_reported" });
  return signals.slice(0, 100);
}
