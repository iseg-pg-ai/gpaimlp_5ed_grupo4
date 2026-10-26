// Definições de seguimento e verificações de governança. Tudo é acrescentado (nunca
// substituído): cada gravação é um registo novo e vale o mais recente, para haver histórico.
export const SETTINGS = { partition: 'BLU-SETTINGS', prefix: 'SETTING#' };
export const ATTESTATIONS = { partition: 'BLU-GOVERNANCE', prefix: 'ATTEST#', validDays: 90 };

// Mensagens automáticas ao cliente. Os lembretes de atividades já eram enviados à hora
// marcada depois de o curador os aprovar; agradecimento e reativação ficam desligados.
export const AUTO_TYPES = {
  thanks: 'Agradecimento logo após o consentimento',
  nudge: 'Reativação quando o cliente fica 3 dias em silêncio depois do contacto',
  reminders: 'Lembretes de recolhas e excursões aprovadas',
};
export const DEFAULTS = { replyHours: 4, auto: { thanks: false, nudge: false, reminders: true } };
export const NUDGE_DAYS = 3;
const STOP = /^\s*(stop|unsubscribe|parar|pare|cancelar)\b/i;

/** Definições em vigor: o registo mais recente, completado com os valores por defeito. */
export function currentSettings(items) {
  const latest = items.map(item => item.recordKey?.S ?? '').filter(key => key.startsWith(SETTINGS.prefix)).sort().at(-1);
  const item = items.find(entry => entry.recordKey?.S === latest);
  let saved = {};
  try {
    saved = JSON.parse(item?.settingsJson?.S || '{}');
  } catch {
    saved = {};
  }
  return {
    replyHours: Number.isInteger(saved.replyHours) ? saved.replyHours : DEFAULTS.replyHours,
    auto: Object.fromEntries(Object.keys(AUTO_TYPES).map(type => [type, typeof saved.auto?.[type] === 'boolean' ? saved.auto[type] : DEFAULTS.auto[type]])),
    updatedBy: item?.updatedBy?.S ?? '',
    updatedAt: item?.updatedAt?.S ?? '',
  };
}

/** Valida uma alteração; devolve { settings } ou { error }. */
export function parseSettings(body, current) {
  const next = { replyHours: current.replyHours, auto: { ...current.auto } };
  if (body.replyHours !== undefined) {
    const hours = Number(body.replyHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 72) return { error: 'O prazo de resposta vai de 1 a 72 horas.' };
    next.replyHours = hours;
  }
  if (body.auto !== undefined) {
    if (!body.auto || typeof body.auto !== 'object') return { error: 'Mensagens automáticas inválidas.' };
    for (const [type, value] of Object.entries(body.auto)) {
      if (!AUTO_TYPES[type] || typeof value !== 'boolean') return { error: 'Mensagens automáticas inválidas.' };
      next.auto[type] = value;
    }
  }
  return { settings: next };
}

/** Prazo da primeira resposta: horas desde a última mensagem do cliente ainda sem contacto. */
export function replyState(lead, hours, now = new Date()) {
  if (lead.status === 'CONTACTED' || !lead.lastActivityAt) return { replyDueAt: '', replyLate: false };
  const due = new Date(Date.parse(lead.lastActivityAt) + hours * 36e5);
  return { replyDueAt: due.toISOString(), replyLate: due <= now };
}

// Regras cuja verificação traz um valor que a fundadora indica (número ou entidade).
export const VALUE_RULES = {
  'rnavt-registration': { label: 'Número RNAVT', pattern: /^\d{1,6}$/, error: 'O número RNAVT tem só algarismos (até 6).' },
  'adr-information': { label: 'Entidade de RAL', pattern: /^.{3,120}$/, error: 'Indique o nome da entidade de RAL.' },
};

/** Valida uma verificação; devolve { record } ou { error }. */
export function parseAttestation(body, policyIds) {
  const policyId = typeof body.policyId === 'string' ? body.policyId : '';
  if (!policyIds.includes(policyId)) return { error: 'Regra desconhecida.' };
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (note.length < 5) return { error: 'Descreva em poucas palavras o que confirmou.' };
  const proofUrl = typeof body.proofUrl === 'string' ? body.proofUrl.trim() : '';
  if (proofUrl && !/^https:\/\/[^\s<>"]{3,500}$/.test(proofUrl)) return { error: 'A ligação para a prova tem de começar por https://.' };
  const rule = VALUE_RULES[policyId];
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (rule && !rule.pattern.test(value)) return { error: rule.error };
  return { record: { policyId, note, proofUrl, value: rule ? value : '' } };
}

/**
 * Junta as verificações ao relatório do deploy: uma regra manual ou em falta, confirmada
 * nos últimos 90 dias, passa a "verificada" com quem, quando e a prova; as automáticas mantêm-se.
 */
export function applyAttestations(report, items, now = new Date()) {
  if (!report || !Array.isArray(report.policies)) return report ?? null;
  const latest = {};
  for (const item of items) {
    const policyId = item.policyId?.S ?? '';
    const at = item.createdAt?.S ?? '';
    if (policyId && at > (latest[policyId]?.at ?? '')) {
      latest[policyId] = { at, by: item.createdBy?.S ?? '', byName: item.createdByName?.S ?? '', note: item.note?.S ?? '', proofUrl: item.proofUrl?.S ?? '', value: item.value?.S ?? '', validUntil: item.validUntil?.S ?? '' };
    }
  }
  const policies = report.policies.map(policy => {
    const attestation = latest[policy.id];
    const valid = attestation && attestation.validUntil > now.toISOString();
    if (!attestation) return policy;
    if (policy.result.status === 'pass' || !valid) return { ...policy, attestation: { ...attestation, expired: !valid } };
    return { ...policy, attestation, result: { status: 'attested', detail: attestation.note } };
  });
  const count = status => policies.filter(policy => policy.result.status === status).length;
  return { ...report, policies, summary: { ...report.summary, pass: count('pass'), attested: count('attested'), fail: count('fail'), manual: count('manual') } };
}

const firstName = text => (text.match(/\b(?:i'?m|my name is|sou|chamo-me)\s+([A-ZÀ-Ý][a-zà-ÿ]+)/i)?.[1] ?? '');

/**
 * Mensagens automáticas a criar para um lead, conforme as definições. Só com consentimento,
 * nunca a quem pediu para parar, e cada uma uma única vez (chave determinística).
 */
export function autoMessages(lead, messages, contacts, settings, existingKeys, now = new Date()) {
  if (!lead.consentAt || lead.synthetic) return [];
  const said = messages.filter(message => message.actor === 'customer');
  if (said.some(message => STOP.test(message.text))) return [];
  const to = contacts.phones[0]?.replace(/\D/g, '') || contacts.emails[0] || '';
  const channel = contacts.phones[0] ? 'whatsapp' : contacts.emails[0] ? 'email' : 'whatsapp';
  const name = firstName(said.map(message => message.text).join(' '));
  const hello = name ? `Hi ${name}, ` : 'Hi, ';
  const optOut = ' Reply STOP and we will not message you again.';
  const records = [];
  const add = (key, text) => {
    if (existingKeys.has(key)) return;
    records.push({ recordKey: key, audience: 'traveller', kind: 'auto', title: 'Mensagem automática', channel, to, text, sendAt: now.toISOString(), approvedBy: 'auto-settings' });
  };
  if (settings.auto.thanks) {
    add(`NOTIFY#AUTO#thanks#${lead.consentAt}`, `${hello}thank you for planning your Portugal trip with BLU Costa. A curator will reply within ${settings.replyHours} hours.${optOut}`);
  }
  const quiet = lead.status === 'CONTACTED' && lead.lastActivityAt && now - Date.parse(lead.lastActivityAt) >= NUDGE_DAYS * 864e5;
  if (settings.auto.nudge && quiet) {
    add(`NOTIFY#AUTO#nudge#${lead.lastActivityAt}`, `${hello}still thinking about Portugal? Your BLU Costa curator can adjust the plan to your dates and budget whenever you are ready.${optOut}`);
  }
  return records;
}
