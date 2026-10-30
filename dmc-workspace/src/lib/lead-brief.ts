import { interestOptions } from "./brief-options.ts";
import type { CustomerBrief } from "../types/index";

// Rascunho de briefing a partir do que o cliente disse ao chatbot (journeyJson do lead).
// Determinístico e explicável: cada valor que não vem do cliente fica em `assumptions`
// e nas notas, para o curador confirmar antes de gerar e enviar a proposta.
export type LeadForBrief = {
  id: string;
  journey: Record<string, string>;
  emails?: string[];
};

export type LeadBrief = { brief: CustomerBrief; assumptions: string[] };

export const LEAD_DRAFT_STORAGE = "blu-lead-draft";
const DEFAULT_DAYS = 5;
const MAX_DAYS = 30;
const LEAD_TIME_DAYS = 30;

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  iso(new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5));

const MONTHS: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  january: 0,
  fev: 1,
  fevereiro: 1,
  feb: 1,
  february: 1,
  mar: 2,
  marco: 2,
  march: 2,
  abr: 3,
  abril: 3,
  apr: 3,
  april: 3,
  mai: 4,
  maio: 4,
  may: 4,
  jun: 5,
  junho: 5,
  june: 5,
  jul: 6,
  julho: 6,
  july: 6,
  ago: 7,
  agosto: 7,
  aug: 7,
  august: 7,
  set: 8,
  setembro: 8,
  sep: 8,
  sept: 8,
  september: 8,
  out: 9,
  outubro: 9,
  oct: 9,
  october: 9,
  nov: 10,
  novembro: 10,
  november: 10,
  dez: 11,
  dezembro: 11,
  dec: 11,
  december: 11,
};
const MONTH = `\\b(${Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|")})\\b\\.?`;

/** Duração escrita pelo cliente («3 days», «1 semana», «5 noites»), em dias. */
export function durationOf(text: string): number | null {
  const t = plain(text);
  const match = t.match(/\b(\d+|uma?|one|a)\s*(dias?|days?|noites?|nights?|semanas?|weeks?)\b/);
  if (!match) return null;
  const n = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
  const unit = match[2];
  if (/^(semana|week)/.test(unit)) return n * 7;
  if (/^(noite|night)/.test(unit)) return n + 1;
  return n;
}

/** Primeira ocorrência futura (ou do ano indicado) de um mês. */
function monthStart(
  month: number,
  year: number | null,
  today: string,
  part: "early" | "mid" | "late" | null,
) {
  const day = part === "mid" ? 12 : part === "late" ? 22 : 3;
  let y = year ?? Number(today.slice(0, 4));
  let candidate = iso(new Date(Date.UTC(y, month, day)));
  if (!year && candidate < today) candidate = iso(new Date(Date.UTC(++y, month, day)));
  return candidate;
}

/** Datas a partir do texto do cliente; devolve também o que foi presumido. */
export function datesOf(
  timeframe: string,
  today: string,
): { startDate: string; endDate: string; assumed: string[] } {
  const t = plain(timeframe);
  const assumed: string[] = [];
  const duration = durationOf(t);
  const year = Number(t.match(/\b(20\d{2})\b/)?.[1]) || null;
  const finish = (start: string, end?: string) => {
    let endDate = end ?? addDays(start, (duration ?? DEFAULT_DAYS) - 1);
    if (!end && !duration) assumed.push(`Duração presumida: ${DEFAULT_DAYS} dias.`);
    if (addDays(start, MAX_DAYS) < endDate) {
      endDate = addDays(start, MAX_DAYS);
      assumed.push(`Viagem encurtada para ${MAX_DAYS + 1} dias (máximo do roteiro).`);
    }
    return { startDate: start, endDate, assumed };
  };

  const isoDates = [...t.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  if (isoDates.length >= 2) return finish(isoDates[0], isoDates[1]);
  if (isoDates.length === 1) {
    const start = /\b(after|depois|apos|a partir)\b/.test(t)
      ? addDays(isoDates[0], 1)
      : isoDates[0];
    return finish(start);
  }

  // «12–18 May 2027» ou «25 nov – 10 dez 2026».
  const range = t.match(
    new RegExp(`(\\d{1,2})\\s*(?:${MONTH})?\\s*(?:-|–|—|a|to|ate)\\s*(\\d{1,2})\\s*${MONTH}`),
  );
  if (range) {
    const endMonth = MONTHS[range[4]];
    const startMonth = range[2] ? MONTHS[range[2]] : endMonth;
    const start =
      monthStart(startMonth, year, today, null).slice(0, 8) + String(range[1]).padStart(2, "0");
    let endYear = Number(start.slice(0, 4));
    if (endMonth < startMonth) endYear += 1;
    const end = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-${String(range[3]).padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) && end >= start)
      return finish(start, end);
  }

  const single = t.match(new RegExp(`(?:(\\d{1,2})\\s*(?:de\\s*)?)?${MONTH}`));
  const part = /\b(mid|meados|meio)\b/.test(t)
    ? "mid"
    : /\b(late|final|fim|end)\b/.test(t)
      ? "late"
      : /\b(early|inicio|principio)\b/.test(t)
        ? "early"
        : null;
  // Meses curtos que também são palavras («mar», «out», «may») só contam com dia, ano ou «meados».
  if (single && (single[1] || year || part || single[2].length > 3)) {
    let start = monthStart(MONTHS[single[2]], year, today, part);
    if (single[1]) start = start.slice(0, 8) + single[1].padStart(2, "0");
    else assumed.push(`Dia de início presumido: ${start}.`);
    return finish(start);
  }

  const start = addDays(today, LEAD_TIME_DAYS);
  assumed.push(`Sem datas do cliente: início presumido em ${start}.`);
  return finish(start);
}

/** Viajantes: «2 adultos», «4 people», «casal», «family», «group of friends». */
export function partyOf(party: string): { adults: number; children: number; assumed: string[] } {
  const t = plain(party);
  const number = (pattern: RegExp) => Number(t.match(pattern)?.[1] ?? NaN);
  const children = number(/(\d+)\s*(criancas?|children|kids?|filhos?)/) || 0;
  const adults = number(/(\d+)\s*(adult\w*|people|pessoas?|persons?|pax|viajantes?)/);
  if (adults) return { adults, children, assumed: [] };
  if (/\b(casal|couple|dois|two|honeymoon|lua de mel)\b/.test(t))
    return { adults: 2, children, assumed: [] };
  if (/\b(solo|sozinh\w*|alone|eu)\b/.test(t)) return { adults: 1, children, assumed: [] };
  if (/\b(famil\w*)\b/.test(t))
    return {
      adults: 2,
      children: children || 2,
      assumed: children ? [] : ["Família: presumidos 2 adultos e 2 crianças."],
    };
  if (/\b(group|grupo|friends|amigos)\b/.test(t))
    return { adults: 4, children, assumed: ["Grupo: presumidos 4 adultos."] };
  return {
    adults: 2,
    children,
    assumed: [
      party
        ? `Viajantes «${party}» por confirmar: presumidos 2 adultos.`
        : "Sem número de viajantes: presumidos 2 adultos.",
    ],
  };
}

/**
 * Orçamento: o limite superior indicado («3000–6000 EUR», «€6,000», «6k»). Os roteiros só
 * aceitam EUR: outra moeda fica com o valor original e um aviso para converter. Sem valor,
 * fica 0 e o formulário obriga o curador a indicá-lo (desconhecido não é preço zero).
 */
export function budgetOf(budget: string): { budget: number; currency: string; assumed: string[] } {
  const t = plain(budget).replace(/(\d)[.,\s](\d{3})\b/g, "$1$2");
  const said = /\$|usd|dolar/.test(t) ? "USD" : /£|gbp|libra/.test(t) ? "GBP" : "EUR";
  const amounts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(k|mil)?/g)]
    .map((m) => Number(m[1]) * (m[2] ? 1000 : 1))
    .filter((n) => n >= 100);
  if (!amounts.length)
    return {
      budget: 0,
      currency: "EUR",
      assumed: ["Sem orçamento do cliente: indicar antes de gerar."],
    };
  const top = Math.max(...amounts);
  const assumed = [
    ...(amounts.length > 1 ? [`Orçamento: usado o limite superior (${top} ${said}).`] : []),
    ...(said !== "EUR" ? [`Orçamento dito em ${said} (${top}): converter para EUR.`] : []),
  ];
  return { budget: top, currency: "EUR", assumed };
}

// Palavras do cliente (inglês e português) → interesses do formulário.
const INTEREST_WORDS: Array<[string, RegExp]> = [
  ["Culture & Heritage", /cultur|histor|heritage|patrimonio|roman|monument|castel|castle/],
  ["Gastronomy & Petiscos", /food|comida|gastronom|culin|petisc|vegan|vegetar|cozinha|restaurant/],
  ["Douro & Alentejo Wines", /wine|vinho|douro|alentejo|adega|quinta/],
  [
    "Atlantic Coast & Nature",
    /surf|beach|praia|nature|natureza|hik|caminhad|costa|coast|ocean|trilh/,
  ],
  ["Tile Craft & Architecture", /azulejo|tile|architect|arquitet/],
  ["Fado & Traditional Music", /fado|music|musica/],
  ["Local Markets & Artisans", /market|mercado|artisan|artesan|craft/],
  ["Contemporary Art (Serralves)", /art\b|arte|museum|museu|serralves|gallery|galeria/],
  ["Bespoke Wellness & Spas", /spa|wellness|bem-estar|relax/],
];
const DIET_WORDS: Array<[string, RegExp]> = [
  ["Vegan", /vegan/],
  ["Vegetarian", /vegetar/],
  ["Gluten-Free (Celiac)", /gluten|celiac|celiaco/],
  ["Halal", /halal/],
  ["Kosher", /kosher/],
];

/** Aeroporto provável de chegada e partida pelo destino; o curador confirma. */
function airportFor(destination: string) {
  const t = plain(destination);
  if (/acores|azores|ponta delgada|sao miguel/.test(t) && !/lisboa|lisbon|algarve|porto/.test(t))
    return "Ponta Delgada João Paulo II Airport (PDL)";
  if (/madeira|funchal/.test(t)) return "Madeira Cristiano Ronaldo Airport (FNC)";
  if (/algarve|faro|lagos|albufeira/.test(t)) return "Faro Airport (FAO)";
  if (/porto|douro|norte|north|braga|minho/.test(t) && !/lisboa|lisbon/.test(t))
    return "Porto Francisco Sá Carneiro Airport (OPO)";
  return "Lisbon Humberto Delgado Airport (LIS)";
}

export function leadToBrief(lead: LeadForBrief, base: CustomerBrief, today: string): LeadBrief {
  const j = lead.journey;
  const assumptions: string[] = [];
  const dates = datesOf([j.timeframe, j.party].filter(Boolean).join(" "), today);
  const party = partyOf(j.party ?? "");
  const money = budgetOf(j.budget ?? "");
  const said = plain([j.interests, j.destination, j.pace].filter(Boolean).join(" "));
  const interests = INTEREST_WORDS.filter(([, pattern]) => pattern.test(said))
    .map(([label]) => label)
    .filter((label) => interestOptions.includes(label));
  const dietaryRestrictions = DIET_WORDS.filter(([, pattern]) => pattern.test(said)).map(
    ([label]) => label,
  );
  const paceText = plain(j.pace ?? "");
  const pace: CustomerBrief["pace"] = /activ|ativ|intens|surf|sport/.test(paceText)
    ? "Active"
    : /relax|calm|tranquil|lento|slow/.test(paceText)
      ? "Relaxed"
      : "Balanced";
  const airport = airportFor(j.destination ?? "");
  const email = lead.emails?.[0] ?? "";

  assumptions.push("Nome do cliente por confirmar (o chat não o pede).");
  if (!j.destination) assumptions.push("Sem destino do cliente: presumido Portugal.");
  assumptions.push(...dates.assumed, ...party.assumed, ...money.assumed);
  if (!interests.length) assumptions.push("Sem interesses claros: escolher no passo Preferências.");
  if (!j.pace) assumptions.push("Ritmo presumido: equilibrado.");
  assumptions.push(`Chegada e partida presumidas em ${airport}.`);
  if (!email) assumptions.push("Sem email do cliente no chat: indicar antes de gerar.");

  const brief: CustomerBrief = {
    ...base,
    customerName: `Lead ${lead.id}`,
    customerEmail: email,
    adults: party.adults,
    children: party.children,
    destination: j.destination || "Portugal",
    startDate: dates.startDate,
    endDate: dates.endDate,
    arrivalLocation: airport,
    departureLocation: airport,
    budget: money.budget,
    currency: money.currency,
    interests,
    dietaryRestrictions,
    pace,
    notes: [
      `Rascunho a partir do lead ${lead.id}. Confirmar com o cliente antes de enviar.`,
      ...Object.entries(j)
        .filter(([key]) =>
          ["destination", "timeframe", "party", "budget", "interests", "pace"].includes(key),
        )
        .map(([key, value]) => `${key}: ${value}`),
      "Pressupostos:",
      ...assumptions.map((item) => `- ${item}`),
    ]
      .join("\n")
      .slice(0, 4000),
  };
  return { brief, assumptions };
}
