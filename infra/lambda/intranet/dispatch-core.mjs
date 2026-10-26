import { NOTIFY, outcome } from './schedule.mjs';
import { contactDetails, toLead, toMessage } from './model.mjs';
import { NUDGE_DAYS, autoMessages } from './settings.mjs';

/**
 * Prepara as mensagens automáticas ligadas nas definições (agradecimento, reativação) como
 * lembretes NOTIFY# normais, que o envio abaixo trata como os outros. Desligadas, não faz nada.
 */
export function createPlanner(deps) {
  return async function planAuto() {
    const now = deps.now?.() ?? new Date();
    const settings = await deps.settings();
    if (!settings.auto.thanks && !settings.auto.nudge) return 0;
    const leads = (await deps.leads()).map(toLead).filter(lead => lead.consentAt && !lead.synthetic);
    const candidates = leads.filter(lead => settings.auto.thanks || (lead.status === 'CONTACTED' && now - Date.parse(lead.lastActivityAt) >= NUDGE_DAYS * 864e5));
    let created = 0;
    for (const lead of candidates) {
      const existing = new Set(await deps.autoKeys(lead.id));
      const messages = (await deps.transcript(lead.id)).map(toMessage);
      for (const record of autoMessages(lead, messages, contactDetails(messages), settings, existing, now)) {
        if (await deps.create(lead.id, { ...record, followUpStatus: NOTIFY.pending, followUpAt: record.sendAt, createdAt: now.toISOString() })) created += 1;
      }
    }
    return created;
  };
}

const LATE_MS = 6 * 36e5;
const s = (item, key) => item[key]?.S ?? '';

/**
 * Envia os lembretes vencidos. Cada lembrete é primeiro "reservado" (PENDING → SENDING)
 * com condição, para que duas execuções sobrepostas nunca enviem a mesma mensagem.
 */
export function createDispatcher(deps) {
  return async function dispatch() {
    const now = deps.now?.() ?? new Date();
    const due = await deps.queryDue(now.toISOString());
    const results = [];
    for (const item of due) {
      const id = s(item, 'conversationId');
      const recordKey = s(item, 'recordKey');
      if (!(await deps.claim(id, recordKey))) continue;
      const to = s(item, 'to');
      const late = now - new Date(s(item, 'followUpAt')) > LATE_MS;
      let error = '';
      // "test-inbox" quando o WhatsApp está em modo de teste: entregue só na caixa de teste.
      let delivery = '';
      if (to && !late) {
        try {
          delivery = (await deps.send({ channel: s(item, 'channel') || 'whatsapp', to, text: s(item, 'text'), title: s(item, 'title'), conversationId: id, requestId: deps.requestIdFor(recordKey), approvedBy: s(item, 'approvedBy') || 'curator-schedule' }))?.delivery ?? '';
        } catch (failure) {
          error = String(failure?.message ?? 'Error');
        }
      }
      const result = outcome({ to, error, late });
      const sent = result.status === NOTIFY.sent ? { sentAt: now.toISOString(), ...(delivery ? { delivery } : {}) } : {};
      await deps.finish(id, recordKey, { followUpStatus: result.status, attemptedAt: now.toISOString(), ...(result.reason ? { reason: result.reason } : {}), ...sent });
      results.push({ recordKey, audience: s(item, 'audience'), channel: s(item, 'channel') || 'whatsapp', status: result.status, ...(sent.delivery ? { delivery } : {}) });
    }
    if (results.length) await deps.evidence(now, results);
    return { checkedAt: now.toISOString(), due: due.length, processed: results.length, sent: results.filter(r => r.status === NOTIFY.sent).length };
  };
}
