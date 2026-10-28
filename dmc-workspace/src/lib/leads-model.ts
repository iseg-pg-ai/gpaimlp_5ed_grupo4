// Normaliza os registos de conversas e acompanhamento para o modelo apresentado no portal.
// Contrato partilhado com infra/lambda/event-processor e churn-evaluator: o registo
// PROFILE de cada conversa guarda o estado de seguimento indexado em FollowUpIndex.
export const OPEN_STATUSES = ["PENDING", "QUEUED_FOR_REVIEW"] as const;
export const CONTACTED = "CONTACTED";
export type LeadFilter = "open" | "contacted";

type Attribute = { S?: string; N?: string; BOOL?: boolean; SS?: string[] };
export type Item = Record<string, Attribute | undefined>;

export type Lead = {
  id: string;
  status: string;
  followUpAt: string;
  lastActivityAt: string;
  channel: string;
  messageCount: number;
  synthetic: boolean;
  contactedAt?: string;
  stage?: string;
  consentAt?: string;
  journey: Record<string, string>;
  tags: string[];
  curatorNote?: string;
  taggedAt?: string;
};

export type LeadMessage = {
  at: string;
  actor: string;
  channel: string;
  eventType: string;
  text: string;
};

export type LeadDetail = Lead & {
  messages: LeadMessage[];
  emails: string[];
  phones: string[];
};

const s = (item: Item, key: string) => item[key]?.S ?? "";

// journeyJson guarda o último contexto enviado pelo chat (destino, datas, campanha, etapa).
function journeyOf(item: Item): Record<string, string> {
  try {
    const value = JSON.parse(s(item, "journeyJson") || "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, text]) => typeof text === "string" && key !== "journeyReference")
        .map(([key, text]) => [key, text as string]),
    );
  } catch {
    return {};
  }
}

export const journeyLabels: Record<string, string> = {
  destination: "Destino",
  timeframe: "Datas",
  party: "Viajantes",
  budget: "Orçamento",
  interests: "Interesses",
  pace: "Ritmo",
  socialSource: "Origem",
  campaign: "Campanha",
  medium: "Meio",
  content: "Conteúdo",
};

export const stageText: Record<string, string> = {
  exploring: "A explorar",
  qualifying: "A qualificar",
  "ready-for-curator": "Pronto para curador",
  "curator-follow-up": "Consentiu seguimento",
};

// Etiquetas fixas para que CRM, churn e relatórios contem as mesmas categorias.
export const LEAD_TAGS: Record<string, string> = {
  hot: "Muito interessado",
  "proposal-next": "Preparar proposta",
  "needs-info": "Falta informação",
  vip: "VIP",
  "at-risk": "Risco de perda",
  "not-a-fit": "Fora do âmbito",
};
export const NOTE_LIMIT = 1000;

export const cleanTags = (values: unknown) =>
  Array.isArray(values)
    ? [
        ...new Set(
          values.filter(
            (value): value is string => typeof value === "string" && value in LEAD_TAGS,
          ),
        ),
      ]
    : [];

export function toLead(item: Item): Lead {
  return {
    id: s(item, "conversationId"),
    status: s(item, "followUpStatus"),
    followUpAt: s(item, "followUpAt"),
    lastActivityAt: s(item, "lastActivityAt"),
    channel: s(item, "lastChannel"),
    messageCount: Number(item.messageCount?.N ?? 0),
    synthetic: item.synthetic?.BOOL === true,
    ...(s(item, "contactedAt") ? { contactedAt: s(item, "contactedAt") } : {}),
    ...(s(item, "journeyStage") ? { stage: s(item, "journeyStage") } : {}),
    ...(s(item, "consentAt") ? { consentAt: s(item, "consentAt") } : {}),
    journey: journeyOf(item),
    tags: cleanTags(item.tags?.SS ?? []),
    ...(s(item, "curatorNote") ? { curatorNote: s(item, "curatorNote") } : {}),
    ...(s(item, "taggedAt") ? { taggedAt: s(item, "taggedAt") } : {}),
  };
}

export function toMessage(item: Item): LeadMessage {
  return {
    at: s(item, "occurredAtId").split("#")[0],
    actor: s(item, "actor"),
    channel: s(item, "channel"),
    eventType: s(item, "eventType") || "conversation.message.recorded",
    text: s(item, "text"),
  };
}

/** Contactos escritos pelo cliente; mensagens do assistente não contam. */
export function contactDetails(messages: LeadMessage[]) {
  const said = messages.filter((m) => m.actor === "customer").map((m) => m.text);
  const unique = (values: string[]) => [...new Set(values)];
  const emails = unique(said.flatMap((t) => t.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi) ?? []));
  const phones = unique(
    said
      .flatMap((t) => t.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [])
      .map((p) => p.replace(/[^\d+]/g, ""))
      .filter((p) => p.replace("+", "").length >= 9),
  );
  return { emails, phones };
}

export function isOverdue(lead: Lead, now = new Date()) {
  return lead.status !== CONTACTED && Boolean(lead.followUpAt) && new Date(lead.followUpAt) <= now;
}

export const validLeadId = (id: string) => /^[A-Za-z0-9-]{8,80}$/.test(id);
