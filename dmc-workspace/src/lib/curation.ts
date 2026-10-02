import type { CustomerBrief, ItineraryDay, ActivityItem } from "../types/index";
import { matchCatalogProfile, validateMatching, type MatchingProfile } from "./catalog-matching.ts";

export type Row = Record<string, unknown>;
export type Catalog = {
  atracoes: Row[];
  experiencias: Row[];
  restaurantes: Row[];
  curation_rules: Row[];
};
const norm = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const text = (row: Row, key: string) => String(row[key] ?? "");

export function validateBrief(value: unknown): asserts value is CustomerBrief {
  if (!value || typeof value !== "object") throw new Error("Briefing inválido.");
  const b = value as CustomerBrief;
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
const exclusions: Record<string, RegExp> = {
  "No Crowded Tour Buses": /autocarro|hop.on|bus tour/,
  "No Commercial Souvenir Shops": /souvenir|lembranc/,
  "No Standard Large Museums": /museu/,
  "No Religious / Churches": /igreja|catedral|religios|mosteiro|convento/,
  "No Open Boats (Sea Sickness)": /barco|cruzeiro|rabelo|veleiro/,
  "No Alcohol / Wine Tastings": /vinho|prova|adega|enotur|cerveja/,
};
const cities: Record<string, string[]> = {
  Lisboa: ["lisboa", "lisbon", "lis"],
  Porto: ["porto", "opo"],
  Sintra: ["sintra"],
  Cascais: ["cascais"],
  Douro: ["douro", "pinhao", "regua"],
};
function mentioned(value: string, aliases: string[]) {
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
  let remainingBudget = brief.budget;
  const maxEffort = brief.physicalEffort.startsWith("Baixo")
    ? 0
    : brief.physicalEffort.startsWith("Moderado")
      ? 1
      : 2;
  const limit = brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4;
  const itinerary: ItineraryDay[] = Array.from({ length: count }, (_, i) => {
    const city = route[Math.floor((i * route.length) / count)];
    const date = new Date(Date.parse(brief.startDate) + i * 86400000).toISOString().slice(0, 10);
    const candidates = all
      .filter(({ row, table }) => {
        if (row._catalog_status !== "approved") return false;
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
    const selected = [];
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const price = (candidate.row._matching as MatchingProfile | undefined)?.pricePerPerson;
      const estimated = typeof price === "number" ? price * (brief.adults + brief.children) : 0;
      if (estimated > remainingBudget) continue;
      remainingBudget -= estimated;
      selected.push(candidate);
    }
    const items: ActivityItem[] = selected.map(({ row, table, matching }) => {
      const profile = row._matching as MatchingProfile | undefined;
      const catalogDetails = {
        location: text(row, "morada") || text(row, "localizacao") || text(row, "cidade"),
        price: String(row.preco_da_atracao ?? row.preco ?? row.preco_nao_cotacao ?? ""),
        supplier:
          text(row, "fornecedor") || (table === "restaurantes" ? text(row, "estabelecimento") : ""),
        contact: text(row, "contactos"),
        hours: text(row, "horario") || text(row, "horario_base_reconfirmar"),
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
        time: "Por agendar",
        title:
          text(row, "nome_da_atracao") ||
          text(row, "nome_da_experiencia") ||
          text(row, "estabelecimento"),
        category: table === "restaurantes" ? "restaurant" : "activity",
        location: city,
        description:
          text(row, "descricao_curada") ||
          text(row, "descricao") ||
          text(row, "proposta_de_curadoria_blu_nao_aprovada"),
        duration:
          text(row, "tempo_medio_de_visita") ||
          text(row, "duracao") ||
          text(row, "duracao_blu_estimativa"),
        priceNote: `Referência, confirmar: ${row.preco_da_atracao ?? row.preco ?? row.preco_nao_cotacao ?? "sem preço"}`,
        source: enrichedSource,
        appliedRules: [
          "R04: prioridade por interesses",
          "R05: exclusões por etiquetas e texto",
          "R09: sem repetição",
          "R16: esforço conhecido filtrado",
          ...(matching ? matching.reasons : []),
        ],
        accessibilityNotes: text(row, "acessibilidade_nivel_de_confirmacao"),
        dietaryNotes: text(row, "opcoes_alimentares_alergenios"),
        catalogDetails,
        pendingChecks: [
          "Disponibilidade e reserva para esta viagem",
          "Validar preço para esta viagem",
          "Deslocação / ponto de encontro",
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
      summary: `R01: até ${limit} sugestões; R03: início ${brief.morningPreference}. ${items.length ? "Ordem provisória; durações do catálogo, sem validação de agenda." : "Sem sugestões compatíveis disponíveis: requer curadoria manual."}`,
      items,
    };
  });
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
