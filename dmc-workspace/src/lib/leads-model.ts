// Contrato partilhado com infra/lambda/event-processor e churn-evaluator: o registo
// PROFILE de cada conversa guarda o estado de seguimento indexado em FollowUpIndex.
export const OPEN_STATUSES = ["PENDING", "QUEUED_FOR_REVIEW"] as const;
export const CONTACTED = "CONTACTED";
export type LeadFilter = "open" | "contacted";

type Attribute = { S?: string; N?: string; BOOL?: boolean };
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
  consentAt?: string;
  emails: string[];
  phones: string[];
};

const s = (item: Item, key: string) => item[key]?.S ?? "";

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
