import {
  closureState,
  transferEstimate,
  closedOn,
  knownCost,
  proposeSlot,
  clockTime,
} from "./itinerary-scheduling.ts";
import {
  emptyPersonalization,
  validatePersonalization,
  accompanimentMatches,
} from "./brief-personalization.ts";
import type { CustomerBrief, ItineraryDay, ActivityItem } from "../types/index";
import { matchCatalogProfile, validateMatching, type MatchingProfile } from "./catalog-matching.ts";

export type Row = Record<string, unknown>;
export type Catalog = {
  atracoes: Row[];
  experiencias: Row[];
  restaurantes: Row[];
  curation_rules: Row[];
};
export const norm = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const text = (row: Row, key: string) => String(row[key] ?? "");

export function validateBrief(value: unknown): asserts value is CustomerBrief {
  if (!value || typeof value !== "object") throw new Error("Briefing inválido.");
  const b = value as CustomerBrief;
  if (b.personalization !== undefined) validatePersonalization(b.personalization);
  for (const field of [
    "customerName",
    "destination",
    "startDate",
    "endDate",
    "arrivalLocation",
    "departureLocation",
    "currency",
    "childrenAges",
    "specialOccasion",
    "notes",
    "accommodation",
  ] as const)
    if (typeof b[field] !== "string" || b[field].length > 4000)
      throw new Error(`Campo inválido: ${field}`);
  if (!b.customerName.trim() || !b.destination.trim())
    throw new Error("Indique cliente e destino.");
  if (
    b.customerEmail !== undefined &&
    (typeof b.customerEmail !== "string" ||
      b.customerEmail.length > 320 ||
      (b.customerEmail.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.customerEmail)))
  )
    throw new Error("Email do cliente inválido.");
  for (const field of [
    "interests",
    "exclusions",
    "mobilityRestrictions",
    "dietaryRestrictions",
  ] as const)
    if (
      !Array.isArray(b[field]) ||
      b[field].length > 30 ||
      b[field].some((v) => typeof v !== "string" || v.length > 200)
    )
      throw new Error(`Campo inválido: ${field}`);
  if (
    !["Soft", "Classic", "Signature"].includes(b.proposalTier) ||
    !["Relaxed", "Balanced", "Active"].includes(b.pace) ||
    !["Baixo (Low)", "Moderado (Moderate)", "Alto (High)"].includes(b.physicalEffort)
  )
    throw new Error("Tier, ritmo ou esforço inválido.");
  if (
    !["Early (08:30)", "Standard (09:30)", "Late Start (10:30+)"].includes(b.morningPreference) ||
    !["Quick Lunch (~40m)", "Relaxed Dining (~90m)", "Tasting Experience (120m+)"].includes(
      b.diningPace,
    )
  )
    throw new Error("Preferências horárias inválidas.");
  if (
    !Number.isInteger(b.adults) ||
    b.adults < 1 ||
    b.adults > 100 ||
    !Number.isInteger(b.children) ||
    b.children < 0 ||
    b.children > 100 ||
    !Number.isFinite(b.budget) ||
    b.budget <= 0 ||
    b.currency !== "EUR"
  )
    throw new Error("Indique participantes e orçamento positivo em EUR.");
  for (const date of [b.startDate, b.endDate])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Datas inválidas.");
  const days = (Date.parse(b.endDate) - Date.parse(b.startDate)) / 86400000;
  if (days < 0 || days > 30)
    throw new Error("A viagem deve ter entre 1 e 31 dias, com partida após a chegada.");
}

const interests: Record<string, RegExp> = {
  "Culture & Heritage": /cultur|patrimonio|histor|monumento/,
  "Gastronomy & Petiscos": /gastronom|culin|pastel|restaurante|mercado/,
  "Douro & Alentejo Wines": /vinho|enotur|adega|quinta/,
  "Atlantic Coast & Nature": /natureza|jardim|praia|parque|costa/,
  "Tile Craft & Architecture": /azulejo|arquitet|artesan/,
  "Fado & Traditional Music": /fado|musica/,
  "Local Markets & Artisans": /mercado|artesan|oficina/,
  "Contemporary Art (Serralves)": /contemporan|serralves|arte/,
  "Bespoke Wellness & Spas": /spa|bem-estar|wellness/,
};
export const exclusions: Record<string, RegExp> = {
  "No Crowded Tour Buses": /autocarro|hop.on|bus tour/,
  "No Commercial Souvenir Shops": /souvenir|lembranc/,
  "No Standard Large Museums": /museu/,
  "No Religious / Churches": /igreja|catedral|religios|mosteiro|convento/,
  "No Open Boats (Sea Sickness)": /barco|cruzeiro|rabelo|veleiro/,
  "No Alcohol / Wine Tastings": /vinho|prova|adega|enotur|cerveja/,
};
export const cities: Record<string, string[]> = {
  Lisboa: ["lisboa", "lisbon", "lis"],
  Porto: ["porto", "opo"],
  Sintra: ["sintra"],
  Cascais: ["cascais"],
  Douro: ["douro", "pinhao", "regua"],
};
export function mentioned(value: string, aliases: string[]) {
  return aliases.some((a) => new RegExp(`\\b${a}\\b`).test(norm(value)));
}

export function generateItinerary(brief: CustomerBrief, catalog: Catalog) {
  validateBrief(brief);
  const requiredRules = [
    "R01",
    "R03",
    "R04",
    "R05",
    "R09",
    "R15",
    "R16",
    "R33",
    "R40",
    "R41",
    "R43",
  ];
  if (requiredRules.some((id) => !catalog.curation_rules.some((r) => r.id === id)))
    throw new Error("Regras de curadoria em falta. Reexecute o ETL.");
  let route = Object.keys(cities).filter((city) => mentioned(brief.destination, cities[city]));
  if (!route.length && norm(brief.destination).trim() === "portugal") {
    route = Object.keys(cities).filter(
      (city) =>
        mentioned(brief.arrivalLocation, cities[city]) ||
        mentioned(brief.departureLocation, cities[city]),
    );
  }
  if (!route.length)
    throw new Error(
      "Destino sem cobertura identificada. Indique Lisboa, Porto, Sintra, Cascais ou Douro.",
    );
  route.sort(
    (a, b) =>
      Number(mentioned(brief.arrivalLocation, cities[b])) -
      Number(mentioned(brief.arrivalLocation, cities[a])),
  );
  const count = (Date.parse(brief.endDate) - Date.parse(brief.startDate)) / 86400000 + 1;
  if (route.length > count) throw new Error("Demasiados destinos para os dias disponíveis.");
  const pending = [
    "Rascunho para revisão: horários de abertura, reservas, deslocações, chegada/partida e disponibilidade por confirmar.",
    "Orçamento é um limite do cliente, não uma cotação. Preços de referência não incluem necessariamente alojamento, transporte, impostos ou todos os participantes.",
    "Tier altera a prioridade entre visitas essenciais e experiências de aprofundamento; inclusões e exclusividade dependem de aprovação BLU (R33–R44).",
  ];
  if (brief.mobilityRestrictions.length)
    pending.push(
      "Acessibilidade não certificada no catálogo: todas as sugestões ficam sujeitas a confirmação antes de aprovação (R15–R17).",
    );
  if (brief.dietaryRestrictions.length)
    pending.push(
      "Refeições e experiências alimentares não incluídas sem confirmação das restrições e contaminação cruzada pelo fornecedor.",
    );
  if (brief.notes || brief.specialOccasion)
    pending.push(
      "Notas livres e ocasião especial requerem leitura e validação do curador; não são interpretadas automaticamente.",
    );
  const unsupported = brief.exclusions.filter((e) => !exclusions[e]);
  if (unsupported.length) throw new Error(`Exclusões não suportadas: ${unsupported.join(", ")}`);
  const all = Object.entries(catalog)
    .filter(([table]) => table !== "curation_rules")
    .flatMap(([table, records]) => records.map((row) => ({ table, row })));
  const used = new Set<string>();
  const personalization = brief.personalization ?? emptyPersonalization();
  const fulfilled = new Set<string>();
  if (personalization.groupNeeds.trim())
    pending.push(`Necessidades do grupo para revisão do curador: ${personalization.groupNeeds}`);
  if (
    ["guided", "private"].includes(personalization.accompaniment) &&
    personalization.guideLanguage
  )
    pending.push(
      `Idioma de acompanhamento a confirmar com o fornecedor: ${personalization.guideLanguage}`,
    );
  if (personalization.accompaniment !== "any")
    pending.push(
      "Acompanhamento filtrado pela modalidade explícita do catálogo; disponibilidade por confirmar.",
    );
  if (personalization.budgetFlex)
    pending.push(
      `Margem de orçamento autorizada: ${personalization.budgetFlex}%. Limite de referência: ${brief.budget * (1 + personalization.budgetFlex / 100)} EUR; não constitui cotação.`,
    );
  let remainingBudget = brief.budget * (1 + personalization.budgetFlex / 100);
  const maxEffort = brief.physicalEffort.startsWith("Baixo")
    ? 0
    : brief.physicalEffort.startsWith("Moderado")
      ? 1
      : 2;
  const limit = personalization.extraBreaks
    ? 2
    : brief.pace === "Relaxed"
      ? 2
      : brief.pace === "Balanced"
        ? 3
        : 4;
  const itinerary: ItineraryDay[] = Array.from({ length: count }, (_, i) => {
    const city = route[Math.floor((i * route.length) / count)];
    const date = new Date(Date.parse(brief.startDate) + i * 86400000).toISOString().slice(0, 10);
    const candidates = all
      .filter(({ row, table }) => {
        if (
          row._catalog_status !== "approved" ||
          closedOn(row, date) ||
          closureState(row.dias_de_encerramento ?? row.encerramento_base_reconfirmar, date) ===
            "closed"
        )
          return false;
        if (personalization.avoid.includes(String(row.subcategoria ?? ""))) return false;
        // An unclassified record cannot be certified as outside the excluded subcategories.
        if (personalization.avoid.length && !row.subcategoria) return false;
        if (
          table !== "restaurantes" &&
          !accompanimentMatches(row.modalidade, personalization.accompaniment)
        )
          return false;
        const profile = row._matching as MatchingProfile | undefined;
        if (profile !== undefined) {
          try {
            validateMatching(profile);
          } catch {
            return false;
          }
          if (!matchCatalogProfile(profile, brief, date, table === "restaurantes")) return false;
        }
        const location = text(row, "cidade") || text(row, "localizacao");
        const body = norm(Object.values(row).join(" "));
        const key = `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`;
        if (used.has(key) || !mentioned(location, cities[city])) return false;
        if (brief.exclusions.some((e) => exclusions[e].test(body))) return false;
        const effort = ["baixo", "moderado", "alto"].indexOf(norm(row.esforco_fisico));
        if (profile && effort < 0) return false;
        if (effort > maxEffort) return false;
        if (
          !profile &&
          brief.mobilityRestrictions.length &&
          (effort > 0 || /escad|ingreme|subida|piso irregular/.test(body))
        )
          return false;
        if (
          !profile &&
          brief.dietaryRestrictions.length &&
          (table === "restaurantes" ||
            /gastronom|comida|bebida|vinho|pastel|jantar|almoco|prova|culin/.test(body))
        )
          return false;
        return true;
      })
      .map((candidate) => {
        const body = norm(Object.values(candidate.row).join(" "));
        const profile = candidate.row._matching as MatchingProfile | undefined;
        const matching =
          profile && matchCatalogProfile(profile, brief, date, candidate.table === "restaurantes");
        const score =
          (personalization.mustHave.includes(String(candidate.row.subcategoria)) &&
          !fulfilled.has(String(candidate.row.subcategoria))
            ? 1000
            : 0) +
          (matching
            ? matching.score
            : brief.interests.reduce(
                (s, interest) => s + (interests[interest]?.test(body) ? 10 : 0),
                0,
              )) +
          (candidate.table === (brief.proposalTier === "Soft" ? "atracoes" : "experiencias")
            ? 3
            : 0) +
          (brief.proposalTier === "Signature" && /oficina|imers|privad|especialista/.test(body)
            ? 2
            : 0);
        return { ...candidate, score, matching };
      })
      .sort((a, b) => b.score - a.score || Number(a.row._source_row) - Number(b.row._source_row));
    const selected: ((typeof candidates)[number] & {
      slot: ReturnType<typeof proposeSlot>;
      cost: number | null;
      transfer: string;
    })[] = [];
    let cursor = brief.morningPreference.startsWith("Early")
      ? 510
      : brief.morningPreference.startsWith("Late")
        ? 630
        : 570;
    const buffer = personalization.extraBreaks ? 45 : 30;
    let previousLocation: Row | undefined;
    const chosenCategories = new Set<string>();
    // Rotate the starting category across days; tiers still rank within each category.
    const order = ["atracoes", "restaurantes", "experiencias"];
    const categoryOrder = [...order.slice(i % 3), ...order.slice(0, i % 3)];
    const ranked = [...candidates];
    while (ranked.length && selected.length < limit) {
      ranked.sort(
        (a, b) =>
          Number(chosenCategories.has(a.table)) - Number(chosenCategories.has(b.table)) ||
          categoryOrder.indexOf(a.table) - categoryOrder.indexOf(b.table) ||
          b.score - a.score,
      );
      const candidate = ranked.shift()!;
      const cost = knownCost(candidate.row, brief.adults + brief.children);
      if (cost !== null && cost > remainingBudget) continue;
      const transfer = transferEstimate(previousLocation, candidate.row, buffer);
      const slot = proposeSlot(
        candidate.row,
        candidate.table === "restaurantes",
        brief,
        cursor + transfer.minutes,
        date,
      );
      if (slot.kind === "unavailable") continue;
      if (cost !== null) remainingBudget -= cost;
      if (slot.kind === "scheduled") cursor = slot.end;
      selected.push({ ...candidate, slot, cost, transfer: transfer.note });
      if (slot.kind === "scheduled") previousLocation = candidate.row;
      chosenCategories.add(candidate.table);
      fulfilled.add(String(candidate.row.subcategoria));
    }
    const items: ActivityItem[] = selected.map(({ row, table, matching, slot, cost, transfer }) => {
      const profile = row._matching as MatchingProfile | undefined;
      const catalogDetails = {
        ...(row._pricing
          ? { pricing: { ...(row._pricing as import("./catalog-schema").CatalogPricing) } }
          : {}),
        inclusions: text(row, "inclusoes"),
        exclusions: text(row, "exclusoes"),
        taxes: text(row, "impostos_taxas"),
        location: text(row, "morada") || text(row, "localizacao") || text(row, "cidade"),
        price: String(row.preco_da_atracao ?? row.preco ?? row.preco_nao_cotacao ?? ""),
        supplier:
          text(row, "fornecedor") || (table === "restaurantes" ? text(row, "estabelecimento") : ""),
        contact: text(row, "contactos"),
        hours: [
          text(row, "horario") || text(row, "horario_base_reconfirmar"),
          text(row, "dias_de_encerramento") || text(row, "encerramento_base_reconfirmar"),
          text(row, "observacoes"),
        ]
          .filter(Boolean)
          .join(" · "),
        accessibility: text(row, "acessibilidade_nivel_de_confirmacao"),
        dietary: text(row, "opcoes_alimentares_alergenios"),
        verification: profile?.verificationNotes ?? "",
      };
      const id = `${table}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`;
      used.add(id);
      const source = row._catalog_id
        ? `${table} · ${row._catalog_id} · revisão ${row._catalog_revision} · ${row.site_fonte ?? ""}`
        : `${table} · ${row.id ?? row.id_blu ?? row.nome_da_experiencia} · ${row._source_sheet}, linha ${row._source_row}`;
      const supplement = row._supplement_source as
        | { file?: string; sheet?: string; row?: number; status?: string }
        | undefined;
      const enrichedSource = supplement
        ? `${source}. Complemento: ${supplement.file}, ${supplement.sheet}, linha ${supplement.row} (${supplement.status ?? "por validar"})`
        : source;
      return {
        id,
        time:
          slot.kind === "scheduled"
            ? `${clockTime(slot.start)}–${clockTime(slot.end)} (proposto)`
            : "Por agendar",
        title:
          text(row, "nome_da_atracao") ||
          text(row, "nome_da_experiencia") ||
          text(row, "estabelecimento"),
        category: table === "restaurantes" ? "restaurant" : "activity",
        location: city,
        latitude:
          typeof row.latitude === "number" && Number.isFinite(row.latitude)
            ? row.latitude
            : typeof row.latitude === "string" && Number.isFinite(parseFloat(row.latitude))
              ? parseFloat(row.latitude)
              : undefined,
        longitude:
          typeof row.longitude === "number" && Number.isFinite(row.longitude)
            ? row.longitude
            : typeof row.longitude === "string" && Number.isFinite(parseFloat(row.longitude))
              ? parseFloat(row.longitude)
              : undefined,
        description:
          text(row, "descricao_curada") ||
          text(row, "descricao") ||
          text(row, "proposta_de_curadoria_blu_nao_aprovada"),
        duration:
          text(row, "tempo_medio_de_visita") ||
          text(row, "duracao") ||
          text(row, "duracao_blu_estimativa"),
        priceNote: `Referência, confirmar: ${text(row, "preco_da_atracao") || text(row, "preco") || text(row, "preco_nao_cotacao") || "Preço por confirmar"}${cost === null ? "; custo total por confirmar" : `; referência para o grupo: ${cost} EUR`}`,
        source: enrichedSource,
        appliedRules: [
          "R04: prioridade por interesses",
          "R05: exclusões por etiquetas e texto",
          "R09: sem repetição",
          "R16: esforço conhecido filtrado",
          ...(matching ? matching.reasons : []),
          ...(personalization.mustHave.includes(String(row.subcategoria))
            ? [`Imperdível solicitado: ${row.subcategoria}`]
            : []),
        ],
        accessibilityNotes: text(row, "acessibilidade_nivel_de_confirmacao"),
        dietaryNotes: text(row, "opcoes_alimentares_alergenios"),
        catalogDetails,
        pendingChecks: [
          "Disponibilidade e reserva para esta viagem",
          ...(row.observacoes ? [`Condições da fonte a verificar: ${row.observacoes}`] : []),
          ...(row.necessidade_de_reserva || row.reservas_condicoes_base
            ? [`Condições de reserva: ${row.necessidade_de_reserva || row.reservas_condicoes_base}`]
            : []),
          ...(slot.kind === "scheduled"
            ? [
                `Horário proposto; reconfirmar funcionamento e margem de ${buffer} min para deslocação/pausa`,
              ]
            : ["Horário e duração sem dados suficientes: agendar manualmente"]),
          ...(cost === null ? ["Custo desconhecido: orçamento total não validado"] : []),
          "Validar preço para esta viagem",
          "Deslocação / ponto de encontro",
          ...(transfer ? [transfer] : []),
          ...(brief.mobilityRestrictions.length && !profile
            ? ["Acessibilidade para as necessidades do cliente"]
            : []),
          ...(brief.dietaryRestrictions.length && !profile && table === "restaurantes"
            ? ["Condições alimentares"]
            : []),
        ],
      };
    });
    return {
      dayNumber: i + 1,
      date: new Date(Date.parse(brief.startDate) + i * 86400000).toISOString().slice(0, 10),
      title: city,
      location: city,
      tier: brief.proposalTier,
      summary: `R01: até ${limit} sugestões; R03: início ${brief.morningPreference}. ${items.length ? "Horários propostos quando os dados permitem; intervalos estimados para deslocações e pausas. Itens por agendar requerem integração manual na agenda." : "Sem sugestões compatíveis disponíveis: requer curadoria manual."}`,
      items,
    };
  });
  for (const required of personalization.mustHave)
    if (!fulfilled.has(required))
      pending.push(
        `Imperdível não incluído por falta de oferta elegível, orçamento ou espaço no roteiro: ${required}`,
      );
  if (personalization.extraBreaks)
    pending.push(
      "Pausas adicionais: máximo de duas sugestões por dia; horários e intervalos por confirmar.",
    );
  return { itinerary, pending, ruleIds: requiredRules };
}

// Only explicit supported commands may mutate a proposal. No inferred AI actions.
export function applyCommand(itinerary: ItineraryDay[], input: string) {
  const match = norm(input).match(/^remover (?:a )?ultima atividade do dia (\d+)$/);
  if (!match)
    return {
      itinerary,
      reply:
        "Pedido não executado. Use Edit Brief para mudar preferências. Comando disponível: remover última atividade do dia 2.",
    };
  const number = Number(match[1]);
  const last = itinerary.find((d) => d.dayNumber === number)?.items.at(-1);
  if (!last)
    return { itinerary, reply: "Esse dia não existe ou não tem atividades. Nada foi alterado." };
  if (last.confirmation?.status === "confirmed")
    return { itinerary, reply: "Atividade confirmada: reabra a confirmação antes de remover." };
  if (last.isLocked) return { itinerary, reply: "Atividade bloqueada: nada foi alterado." };
  return {
    itinerary: itinerary.map((d) =>
      d.dayNumber === number ? { ...d, items: d.items.slice(0, -1) } : d,
    ),
    reply: `Removida a atividade ${last.title} do dia ${number}. Restantes atividades e bloqueios preservados.`,
  };
}
