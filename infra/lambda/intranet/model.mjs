// Espelha dmc-workspace/src/lib/leads-model.ts (o Lambda não executa TypeScript);
// infra/tests/intranet.test.mjs confirma que estados e etiquetas continuam iguais.
export const OPEN_STATUSES = ['PENDING', 'QUEUED_FOR_REVIEW'];
export const CONTACTED = 'CONTACTED';
export const LEAD_TAGS = ['hot', 'proposal-next', 'needs-info', 'vip', 'at-risk', 'not-a-fit'];
export const NOTE_LIMIT = 1000;
export const QUESTION_LIMIT = 1000;

const s = (item, key) => item?.[key]?.S ?? '';

export const validLeadId = id => /^[A-Za-z0-9-]{8,80}$/.test(id ?? '');

export const cleanTags = values => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === 'string' && LEAD_TAGS.includes(value)))]
  : [];

function journeyOf(item) {
  try {
    const value = JSON.parse(s(item, 'journeyJson') || '{}');
    return Object.fromEntries(Object.entries(value).filter(([key, text]) => typeof text === 'string' && key !== 'journeyReference'));
  } catch {
    return {};
  }
}

// Origens de teste: contam como demonstração mesmo sem a marca synthetic (ex.: «claude-test»).
export const DEMO_SOURCES = ['demo', 'claude-test', 'test'];
const isDemoSource = journey => ['socialSource', 'campaign', 'medium']
  .some(key => DEMO_SOURCES.includes(String(journey[key] ?? '').trim().toLowerCase()));

/** Telefone em formato E.164: «00351…» e «+00351…» passam a «+351…». */
export const normalizePhone = raw => {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  const plus = digits.startsWith('+') || digits.startsWith('00');
  const body = digits.replace(/^\+/, '').replace(/^00/, '');
  return plus ? `+${body}` : body;
};

export function toLead(item) {
  const optional = key => (s(item, key) ? s(item, key) : undefined);
  const journey = journeyOf(item);
  return {
    id: s(item, 'conversationId'),
    status: s(item, 'followUpStatus'),
    followUpAt: s(item, 'followUpAt'),
    lastActivityAt: s(item, 'lastActivityAt'),
    channel: s(item, 'lastChannel'),
    messageCount: Number(item?.messageCount?.N ?? 0),
    synthetic: item?.synthetic?.BOOL === true || isDemoSource(journey),
    contactedAt: optional('contactedAt'),
    stage: optional('journeyStage'),
    consentAt: optional('consentAt'),
    assignedTo: optional('assignedTo'),
    assignedAt: optional('assignedAt'),
    journey,
    tags: cleanTags(item?.tags?.SS ?? []),
    curatorNote: optional('curatorNote'),
    churnSignalAt: optional('churnSignalAt'),
    churnSignal: optional('churnSignal'),
  };
}

/** O cliente disse que ia desistir e ainda ninguém o contactou depois disso. */
export const atRisk = lead => Boolean(lead.churnSignalAt) && (!lead.contactedAt || lead.contactedAt < lead.churnSignalAt);

export function toMessage(item) {
  return {
    at: s(item, 'occurredAtId').split('#')[0],
    actor: s(item, 'actor'),
    channel: s(item, 'channel'),
    eventType: s(item, 'eventType') || 'conversation.message.recorded',
    text: s(item, 'text'),
  };
}

/** Contactos escritos pelo cliente; mensagens do assistente não contam. */
export function contactDetails(messages) {
  const said = messages.filter(message => message.actor === 'customer').map(message => message.text);
  const unique = values => [...new Set(values)];
  const emails = unique(said.flatMap(text => text.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi) ?? []));
  const phones = unique(said
    .flatMap(text => text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [])
    .map(normalizePhone)
    .filter(phone => phone.replace('+', '').length >= 9));
  return { emails, phones };
}

export const isOverdue = (lead, now = new Date()) => lead.status !== CONTACTED && Boolean(lead.followUpAt) && new Date(lead.followUpAt) <= now;

/** Indicadores do funil; registos sintéticos ficam à parte (syntheticExcludedFromBusinessKpis). */
export function metrics(leads, now = new Date()) {
  const real = leads.filter(lead => !lead.synthetic);
  const count = (list, key) => list.reduce((totals, lead) => {
    const value = (typeof key === 'function' ? key(lead) : lead[key]) || 'desconhecido';
    totals[value] = (totals[value] ?? 0) + 1;
    return totals;
  }, {});
  const hours = real
    .filter(lead => lead.contactedAt && lead.consentAt)
    .map(lead => (new Date(lead.contactedAt) - new Date(lead.consentAt)) / 36e5)
    .filter(value => Number.isFinite(value) && value >= 0);
  return {
    total: real.length,
    synthetic: leads.length - real.length,
    open: real.filter(lead => lead.status !== CONTACTED).length,
    overdue: real.filter(lead => isOverdue(lead, now)).length,
    contacted: real.filter(lead => lead.status === CONTACTED).length,
    unassigned: real.filter(lead => lead.status !== CONTACTED && !lead.assignedTo).length,
    medianHoursToContact: hours.length ? Math.round(hours.sort((a, b) => a - b)[Math.floor(hours.length / 2)] * 10) / 10 : null,
    byStatus: count(real, 'status'),
    byStage: count(real, 'stage'),
    bySource: count(real, lead => lead.journey.socialSource || lead.channel),
  };
}

/** Grupos Cognito vêm como lista ou, no autorizador JWT da HTTP API, como "[a b]". */
export function groupsOf(claims = {}) {
  const raw = claims['cognito:groups'];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  return raw.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);
}

// Nome legível para a equipa: o nome técnico da função AWS nunca aparece nos alertas.
const WORKER_LABELS = [
  [/churn/i, 'Revisão diária de leads'], [/dispatch|notif|remind/i, 'Envio de lembretes'], [/whatsapp/i, 'WhatsApp'],
  [/rag|assistant|agent/i, 'Assistente interno'], [/crm/i, 'Ligação ao CRM'], [/chat|conversation|event/i, 'Chatbot e conversas'],
  [/intranet|api/i, 'Servidor da intranet'], [/portal/i, 'Portal de propostas'],
];
export const workerLabel = name => WORKER_LABELS.find(([pattern]) => pattern.test(name))?.[1] ?? 'Processo automático';
