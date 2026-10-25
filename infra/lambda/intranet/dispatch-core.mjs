import { NOTIFY, outcome } from './schedule.mjs';

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
      if (to && !late) {
        try {
          await deps.send({ channel: s(item, 'channel') || 'whatsapp', to, text: s(item, 'text'), title: s(item, 'title'), conversationId: id, requestId: deps.requestIdFor(recordKey), approvedBy: s(item, 'approvedBy') || 'curator-schedule' });
        } catch (failure) {
          error = String(failure?.message ?? 'Error');
        }
      }
      const result = outcome({ to, error, late });
      await deps.finish(id, recordKey, { followUpStatus: result.status, attemptedAt: now.toISOString(), ...(result.reason ? { reason: result.reason } : {}), ...(result.status === NOTIFY.sent ? { sentAt: now.toISOString() } : {}) });
      results.push({ recordKey, audience: s(item, 'audience'), channel: s(item, 'channel') || 'whatsapp', status: result.status });
    }
    if (results.length) await deps.evidence(now, results);
    return { checkedAt: now.toISOString(), due: due.length, processed: results.length, sent: results.filter(r => r.status === NOTIFY.sent).length };
  };
}
