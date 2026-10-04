import { applyCommand, generateItinerary, type Catalog, type Row } from "./curation.ts";
import {
  clockTime,
  durationMinutes,
  knownCost,
  proposeSlot,
  transferEstimate,
} from "./itinerary-scheduling.ts";
import type { Snapshot } from "./itinerary-pdf";
import type { ActivityItem } from "../types/index";
import { optimizeRouteSequence, buildCoordMap } from "./road-routing.ts";

export const assistantHelp =
  'Pedidos disponíveis: adicionar "nome do catálogo" ao dia 1; substituir atividade 1 do dia 1 por "nome do catálogo"; reagendar atividade 1 do dia 1 para 14:00; reorganizar dia 1 na ordem 2,1,3; otimizar rota do dia 1; remover atividade 1 do dia 1. Os números seguem a ordem dos cartões.';
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const protectedItem = (item: ActivityItem) =>
  item.isLocked || item.confirmation?.status === "confirmed";
const rowId = (table: string, row: Row) =>
  `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`;
const title = (row: Row) =>
  String(row.nome_da_atracao || row.nome_da_experiencia || row.estabelecimento || "");

export function editWithAssistant(snapshot: Snapshot, input: string, catalog: Catalog) {
  const original = snapshot.itinerary;
  const reject = (reason: string) => ({
    itinerary: original,
    reply: `Pedido não executado. ${reason}`,
    changed: false,
  });
  const command = normalize(input);
  if (/^remover (?:a )?ultima atividade do dia \d+$/.test(command)) {
    const result = applyCommand(original, input);
    return { ...result, changed: result.itinerary !== original };
  }
  const optimize =
    command.match(/^otimizar (?:a )?rota do dia (\d+)$/) ||
    command.match(/^otimizar (?:o )?trajeto do dia (\d+)$/) ||
    command.match(/^otimizar dia (\d+)$/);
  if (optimize) {
    const number = Number(optimize[1]);
    const day = original.find((d) => d.dayNumber === number);
    if (!day) return reject("Esse dia não existe.");
    if (day.items.length <= 2) {
      return reject("O dia já tem 2 ou menos atividades e não requer otimização de sequência.");
    }
    const allRecords = [
      ...catalog.atracoes,
      ...catalog.experiencias,
      ...catalog.restaurantes,
    ];
    const coordMap = buildCoordMap(allRecords);
    const optimizedItems = optimizeRouteSequence(day.items, coordMap);
    const itinerary = original.map((d) => (d === day ? { ...d, items: optimizedItems } : d));
    return {
      itinerary,
      changed: true,
      reply: `Rota do dia ${number} otimizada pelo BLU Routing Engine para o trajeto rodoviário mais eficiente. Horários sequenciais atualizados.`,
    };
  }
  const add = command.match(/^adicionar "(.+)" ao dia (\d+)$/);
  const replace = command.match(/^substituir atividade (\d+) do dia (\d+) por "(.+)"$/);
  const move = command.match(
    /^reagendar atividade (\d+) do dia (\d+) para ((?:[01]\d|2[0-3]):[0-5]\d)$/,
  );
  const reorder = command.match(/^reorganizar dia (\d+) na ordem ([\d, ]+)$/);
  const remove = command.match(/^remover atividade (\d+) do dia (\d+)$/);
  if (!add && !replace && !move && !reorder && !remove) return reject(assistantHelp);
  const number = Number(add?.[2] ?? reorder?.[1] ?? replace?.[2] ?? move?.[2] ?? remove?.[2]);
  const day = original.find((d) => d.dayNumber === number);
  if (!day) return reject("Esse dia não existe.");
  const index = Number(replace?.[1] ?? move?.[1] ?? remove?.[1]) - 1;
  const item = day.items[index];
  if (!add && !reorder && !item) return reject("Essa atividade não existe.");
  if (item && protectedItem(item))
    return reject(
      "Atividade protegida ou confirmada. Desproteja ou reabra a confirmação antes de alterar.",
    );
  let items = [...day.items];
  const changedIds = new Set<string>();
  const rows = (["atracoes", "restaurantes", "experiencias"] as const).flatMap((table) =>
    catalog[table].map((row) => ({ table, row, id: rowId(table, row) })),
  );
  const rowFor = (a: ActivityItem) => rows.find((r) => r.id === a.id);
  let description = "";
  if (remove) {
    items.splice(index, 1);
    description = `Removida ${item.title}`;
  } else if (add || replace) {
    const name = add?.[1] ?? replace![3];
    const matches = rows.filter(
      (r) => normalize(title(r.row)) === name || normalize(r.id) === name,
    );
    if (matches.length !== 1)
      return reject(
        "Nome inexistente ou ambíguo. Use o nome exato ou identificador do catálogo aprovado.",
      );
    const candidate = matches[0];
    if (original.some((d) => d.items.some((a) => a.id === candidate.id)))
      return reject("Essa oferta já está no roteiro.");
    // Generate with the full brief and calendar, isolating this candidate to reuse every eligibility rule.
    const isolated: Catalog = { ...catalog, atracoes: [], restaurantes: [], experiencias: [] };
    isolated[candidate.table] = [candidate.row];
    const eligible = generateItinerary(
      { ...snapshot.brief, startDate: day.date, endDate: day.date, destination: day.location },
      isolated,
    ).itinerary[0]?.items[0];
    if (!eligible)
      return reject("Oferta incompatível com o briefing, data, orçamento ou regras de curadoria.");
    if (add) items.push(eligible);
    else items[index] = eligible;
    changedIds.add(eligible.id);
    description = add
      ? `Adicionada ${eligible.title}`
      : `Substituída ${item.title} por ${eligible.title}`;
  } else if (reorder) {
    const order = reorder[2].split(",").map((n) => Number(n.trim()) - 1);
    if (
      order.length !== items.length ||
      new Set(order).size !== items.length ||
      order.some((n) => !Number.isInteger(n) || n < 0 || n >= items.length)
    )
      return reject("Indique uma vez cada posição existente no dia.");
    if (items.some(protectedItem))
      return reject(
        "O dia contém atividades protegidas ou confirmadas; a reorganização foi recusada para preservar as marcações.",
      );
    items = order.map((n) => items[n]);
    items.forEach((a) => changedIds.add(a.id));
    description = `Reorganizado o dia na ordem ${reorder[2]}`;
  } else {
    changedIds.add(item.id);
    description = `Reagendada ${item.title} para ${move![3]}`;
  }
  if (!remove) {
    const limit =
      snapshot.brief.personalization?.extraBreaks || snapshot.brief.pace === "Relaxed"
        ? 2
        : snapshot.brief.pace === "Balanced"
          ? 3
          : 4;
    if (items.length > limit)
      return reject("O número de atividades excede o ritmo definido no briefing.");
    let cursor = snapshot.brief.morningPreference.startsWith("Early")
      ? 510
      : snapshot.brief.morningPreference.startsWith("Late")
        ? 630
        : 570;
    let previous: Row | undefined;
    for (let i = 0; i < items.length; i++) {
      const a = items[i],
        record = rowFor(a);
      const margin = i
        ? transferEstimate(
            previous,
            record?.row ?? {},
            snapshot.brief.personalization?.extraBreaks ? 45 : 30,
          ).minutes
        : 0;
      cursor += margin;
      if (changedIds.has(a.id)) {
        if (!record) return reject("Registo de catálogo indisponível para validar o horário.");
        const eligibleCatalog: Catalog = {
          ...catalog,
          atracoes: [],
          restaurantes: [],
          experiencias: [],
        };
        eligibleCatalog[record.table] = [record.row];
        if (
          !generateItinerary(
            {
              ...snapshot.brief,
              startDate: day.date,
              endDate: day.date,
              destination: day.location,
            },
            eligibleCatalog,
          ).itinerary[0]?.items.some((candidate) => candidate.id === a.id)
        )
          return reject(
            "A atividade já não é elegível para este briefing ou data no catálogo atual.",
          );
        const requested = move
          ? Number(move[3].slice(0, 2)) * 60 + Number(move[3].slice(3))
          : cursor;
        if (requested < cursor)
          return reject(
            "O horário cria uma sobreposição ou não deixa margem para deslocações e pausas.",
          );
        const slot = proposeSlot(
          record.row,
          record.table === "restaurantes",
          snapshot.brief,
          requested,
          day.date,
        );
        if (slot.kind !== "scheduled" || (move && slot.start !== requested))
          return reject(
            "Não há horário viável: confirme duração, funcionamento, encerramentos e refeições no catálogo.",
          );
        items[i] = {
          ...a,
          time: `${clockTime(slot.start)}–${clockTime(slot.end)} (proposto)`,
          ...(a.confirmation
            ? {
                confirmation: {
                  ...a.confirmation,
                  time: clockTime(slot.start),
                  status: "pending" as const,
                  confirmedAt: null,
                  checks: a.confirmation.checks.map((c) => ({ ...c, resolved: false })),
                },
              }
            : {}),
        };
        cursor = slot.end;
      } else {
        const match = a.time.match(/^(\d{2}):(\d{2})(?:[–-](\d{2}):(\d{2}))?/);
        const duration = durationMinutes(a.duration);
        if (!match || (!match[3] && !duration))
          return reject(
            "Uma atividade existente não tem horário ou duração suficientes para validar conflitos. Complete os dados primeiro.",
          );
        const start = Number(match[1]) * 60 + Number(match[2]);
        if (start < cursor)
          return reject(
            "A alteração entra em conflito com outra atividade ou com a margem de deslocação.",
          );
        cursor = match[3] ? Number(match[3]) * 60 + Number(match[4]) : start + duration!;
      }
      previous = record?.row;
    }
  }
  const itinerary = original.map((d) => (d === day ? { ...d, items } : d));
  let total = 0,
    unknown = false;
  for (const a of itinerary.flatMap((d) => d.items)) {
    const record = rowFor(a);
    const cost = record
      ? knownCost(record.row, snapshot.brief.adults + snapshot.brief.children)
      : null;
    if (cost === null) unknown = true;
    else total += cost;
  }
  if (
    !remove &&
    total > snapshot.brief.budget * (1 + (snapshot.brief.personalization?.budgetFlex ?? 0) / 100)
  )
    return reject("Os preços conhecidos ultrapassam o orçamento autorizado.");
  return {
    itinerary,
    changed: true,
    reply: `${description} no dia ${number}. Restantes dias e marcações preservados. Horários alterados são propostas; disponibilidade e deslocações requerem confirmação.${unknown ? " Existem preços desconhecidos: o custo total não está validado." : ""}`,
  };
}
