import { readFileSync } from "node:fs";
import path from "node:path";
import { editWithAssistant } from "./assistant-editing.ts";
import { generateItinerary, type Catalog } from "./curation.ts";
import { validateSnapshot } from "./snapshot-validation.ts";
import type { Snapshot } from "./itinerary-pdf";

export type AgentAction = {
  type: string;
  dayNumber: number;
  itemId?: string;
  catalogId?: string;
  time?: string;
  itemIds?: string[];
  capacity?: number;
  period?: string;
};
export type AgentPlan = {
  summary: string;
  actions: AgentAction[];
  warnings: string[];
  requiresConfirmation: true;
  alternatives?: Array<{ dayNumber: number; itemId: string; catalogIds: string[] }>;
};
export type AgentAlternatives = {
  dayNumber: number;
  itemId: string;
  itemTitle: string;
  options: Array<{
    catalogId: string;
    title: string;
    time: string;
    price: string;
    pendingChecks: string[];
  }>;
};
export type AgentProposal = {
  runId: string;
  tripId: string;
  baseVersion: number;
  plan: AgentPlan;
  before: Snapshot["itinerary"];
  after: Snapshot["itinerary"];
  provider: string;
  modelId: string;
  alternatives?: AgentAlternatives[];
};
type Schema = {
  type: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
  items?: Schema;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  "x-action-fields"?: Record<string, string[]>;
};
const schema: Schema = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../src/blu_ai/schemas/action-plan.json"), "utf8"),
);
function validate(value: unknown, rule: Schema): void {
  const fail = () => {
    throw new Error("Proposta estruturada inválida.");
  };
  if (rule.enum && !rule.enum.includes(value)) fail();
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const object = value as Record<string, unknown>;
    if (rule.required?.some((key) => !Object.hasOwn(object, key))) fail();
    for (const [key, item] of Object.entries(object)) {
      if (!Object.hasOwn(rule.properties ?? {}, key)) {
        if (rule.additionalProperties === false) fail();
      } else validate(item, rule.properties![key]);
    }
  } else if (rule.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (rule.minItems ?? 0) ||
      value.length > (rule.maxItems ?? 10000)
    )
      return fail();
    value.forEach((item) => validate(item, rule.items!));
  } else if (rule.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < (rule.minLength ?? 0) ||
      value.length > (rule.maxLength ?? 10000) ||
      (rule.pattern && !new RegExp(rule.pattern).test(value))
    )
      fail();
  } else if (rule.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < (rule.minimum ?? 0) ||
      value > (rule.maximum ?? Number.MAX_SAFE_INTEGER)
    )
      fail();
  } else if (rule.type === "boolean" && typeof value !== "boolean") fail();
}
export function validatePlan(value: unknown): asserts value is AgentPlan {
  validate(value, schema);
  for (const action of (value as AgentPlan).actions) {
    const expected = ["type", "dayNumber", ...schema["x-action-fields"]![action.type]];
    if (
      Object.keys(action).length !== expected.length ||
      expected.some((key) => !Object.hasOwn(action, key))
    )
      throw new Error("Argumentos da ação inválidos.");
  }
}
const protectedItem = (item: Snapshot["itinerary"][number]["items"][number]) =>
  item.isLocked || item.confirmation?.status === "confirmed";
export function simulatePlan(snapshot: Snapshot, plan: AgentPlan, catalog: Catalog): Snapshot {
  validatePlan(plan);
  resolveAlternatives(snapshot, plan, catalog);
  if (!plan.actions.length) return structuredClone(snapshot);
  let current = structuredClone(snapshot);
  for (const action of plan.actions) {
    const day = current.itinerary.find((d) => d.dayNumber === action.dayNumber);
    if (!day) throw new Error("A proposta refere um dia inexistente.");
    const index = day.items.findIndex((item) => item.id === action.itemId);
    if (action.itemId && index < 0) throw new Error("A proposta refere uma atividade inexistente.");
    const n = day.dayNumber;
    const position = index + 1;
    // Os argumentos nunca podem introduzir sintaxe adicional no comando existente.
    if (action.catalogId && /["\r\n]/.test(action.catalogId))
      throw new Error("Identificador inválido.");
    let command: string;
    switch (action.type) {
      case "add_catalog_item":
        command = `adicionar "${action.catalogId}" ao dia ${n}`;
        break;
      case "replace_item":
        command = `substituir atividade ${position} do dia ${n} por "${action.catalogId}"`;
        break;
      case "remove_item":
        command = `remover atividade ${position} do dia ${n}`;
        break;
      case "reschedule_item":
        command = `reagendar atividade ${position} do dia ${n} para ${action.time}`;
        break;
      case "reorder_day": {
        const order = action.itemIds!;
        if (
          order.length !== day.items.length ||
          new Set(order).size !== order.length ||
          order.some((id) => !day.items.some((item) => item.id === id))
        )
          throw new Error("Ordem de atividades inválida.");
        command = `reorganizar dia ${n} na ordem ${order.map((id) => day.items.findIndex((item) => item.id === id) + 1).join(",")}`;
        break;
      }
      case "set_day_capacity":
        command = `ajustar capacidade do dia ${n} para ${action.capacity}`;
        break;
      case "add_free_period":
        command = `adicionar ${action.period === "morning" ? "manha" : "tarde"} livre ao dia ${n}`;
        break;
      case "set_free_day":
        command = `marcar dia ${n} como dia livre`;
        break;
      default:
        throw new Error("Ação não suportada.");
    }
    const result = editWithAssistant(current, command, catalog);
    if (!result.changed) throw new Error(result.reply);
    current = { ...current, itinerary: result.itinerary };
  }
  // Proteções verificadas também após operações que alterem outros cartões no dia.
  for (const day of snapshot.itinerary)
    for (const item of day.items.filter(protectedItem)) {
      const after = current.itinerary
        .find((d) => d.dayNumber === day.dayNumber)
        ?.items.find((i) => i.id === item.id);
      if (JSON.stringify(after) !== JSON.stringify(item))
        throw new Error("A proposta altera uma atividade protegida ou confirmada.");
    }
  for (const day of current.itinerary) {
    const limit =
      day.dailyCapacity ??
      (snapshot.brief.personalization?.extraBreaks || snapshot.brief.pace === "Relaxed"
        ? 2
        : snapshot.brief.pace === "Balanced"
          ? 3
          : 4);
    if (day.items.filter((item) => item.category !== "free_time").length > limit)
      throw new Error("A proposta excede a capacidade diária.");
    // Não conservar trajetos antigos depois de alterar os respetivos pontos.
    if (
      JSON.stringify(day.items) !==
      JSON.stringify(snapshot.itinerary.find((d) => d.dayNumber === day.dayNumber)?.items)
    ) {
      delete day.routeSummary;
      day.items.forEach((item) => {
        // O percurso derivado pode ficar obsoleto mesmo num cartão protegido;
        // a atividade, o seu horário e a confirmação já foram preservados acima.
        delete item.transitToNext;
      });
    }
  }
  validateSnapshot(current);
  return current;
}

export function resolveAlternatives(
  snapshot: Snapshot,
  plan: AgentPlan,
  catalog: Catalog,
): AgentAlternatives[] {
  validatePlan(plan);
  const targets = new Set<string>();
  return (plan.alternatives ?? []).map((group) => {
    const day = snapshot.itinerary.find((d) => d.dayNumber === group.dayNumber);
    const index = day?.items.findIndex((item) => item.id === group.itemId) ?? -1;
    const key = `${group.dayNumber}:${group.itemId}`;
    if (
      !day ||
      index < 0 ||
      targets.has(key) ||
      new Set(group.catalogIds).size !== group.catalogIds.length
    )
      throw new Error("Alvo ou opções de substituição inválidos.");
    targets.add(key);
    const options = group.catalogIds.map((catalogId) => {
      if (/["\r\n]/.test(catalogId)) throw new Error("Identificador de alternativa inválido.");
      const result = editWithAssistant(
        snapshot,
        `substituir atividade ${index + 1} do dia ${day.dayNumber} por "${catalogId}"`,
        catalog,
      );
      if (!result.changed) throw new Error(result.reply);
      const item = result.itinerary.find((d) => d.dayNumber === day.dayNumber)!.items[index];
      if (item.id !== catalogId) throw new Error("Alternativa inexistente no catálogo aprovado.");
      return {
        catalogId: item.id,
        title: item.title,
        time: item.time,
        price: item.priceNote ?? "Preço por confirmar",
        pendingChecks: item.pendingChecks ?? [],
      };
    });
    return {
      dayNumber: day.dayNumber,
      itemId: group.itemId,
      itemTitle: day.items[index].title,
      options,
    };
  });
}

export function plannerContext(snapshot: Snapshot, catalog: Catalog) {
  // Lista explícita: campos futuros do briefing não são enviados implicitamente.
  const brief: Record<string, unknown> = Object.fromEntries(
    (
      [
        "destination",
        "adults",
        "children",
        "childrenAges",
        "startDate",
        "endDate",
        "budget",
        "currency",
        "interests",
        "pace",
        "accommodation",
        "proposalTier",
        "physicalEffort",
        "mobilityRestrictions",
        "dietaryRestrictions",
        "diningPace",
        "morningPreference",
        "exclusions",
      ] as const
    ).map((key) => [key, snapshot.brief[key]]),
  );
  if (snapshot.brief.personalization) {
    const p = snapshot.brief.personalization;
    brief.personalization = Object.fromEntries(
      (
        [
          "mustHave",
          "avoid",
          "budgetFlex",
          "extraBreaks",
          "accompaniment",
          "guideLanguage",
        ] as const
      ).map((key) => [key, p[key]]),
    );
  }
  const candidates: Array<{
    dayNumber: number;
    id: string;
    title: string;
    category: string;
    time: string;
    price?: string;
  }> = [];
  for (const day of snapshot.itinerary) {
    for (const table of ["atracoes", "restaurantes", "experiencias"] as const)
      for (const row of catalog[table]) {
        const isolated: Catalog = { ...catalog, atracoes: [], restaurantes: [], experiencias: [] };
        isolated[table] = [row];
        const item = generateItinerary(
          { ...snapshot.brief, startDate: day.date, endDate: day.date, destination: day.location },
          isolated,
        ).itinerary[0]?.items[0];
        if (
          item &&
          !snapshot.itinerary.some((existingDay) =>
            existingDay.items.some((existing) => existing.id === item.id),
          )
        )
          candidates.push({
            dayNumber: day.dayNumber,
            id: item.id,
            title: item.title,
            category: item.category,
            time: item.time,
            price: item.priceNote,
          });
      }
  }
  // Distribuir o limite entre dias, para não excluir os últimos dias da viagem.
  const byDay = snapshot.itinerary.map((day) =>
    candidates.filter((candidate) => candidate.dayNumber === day.dayNumber),
  );
  const selected = [];
  for (
    let offset = 0;
    selected.length < 120 && byDay.some((items) => offset < items.length);
    offset++
  ) {
    for (const items of byDay)
      if (items[offset] && selected.length < 120) selected.push(items[offset]);
  }
  return {
    brief,
    itinerary: snapshot.itinerary.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date,
      location: day.location,
      dailyCapacity: day.dailyCapacity,
      items: day.items.map((item) => ({
        id: item.id,
        title: item.title,
        time: item.time,
        category: item.category,
        locked: Boolean(protectedItem(item)),
      })),
    })),
    candidates: selected,
    candidatesTruncated: candidates.length > 120,
  };
}
