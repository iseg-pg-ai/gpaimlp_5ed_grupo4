// Caixa de WhatsApp de teste: em modo "test" (o padrão até haver credenciais Meta) nada sai
// da AWS. Os lembretes que iriam por WhatsApp ficam aqui, e a equipa pode responder como BLU
// ou simular a resposta do cliente ou do parceiro para testar o circuito completo, incluindo
// as respostas automáticas.
export const WHATSAPP_TEST = {
  partition: 'WHATSAPP-TEST',
  prefix: 'WAMSG#',
  textLimit: 1000,
  delivery: 'test-inbox',
};

// Autor das respostas automáticas: nunca se confunde com uma pessoa da equipa.
export const AUTO_AUTHOR = { email: 'auto-assistant', name: 'Resposta automática' };

export const whatsappMode = value => (value === 'live' ? 'live' : 'test');

const s = (item, key) => item?.[key]?.S ?? '';

// Uma conversa por número; sem número, um parceiro ou um cliente (lead) ficam com a própria chave,
// como no modo de teste: escolhe-se da lista, nunca se escreve o número à mão.
export const threadKey = message => message.to || (message.partnerId ? `partner:${message.partnerId}` : message.leadId ? `lead:${message.leadId}` : '');

export const inboxRecord = ({ at, id, direction, to = '', partnerId = '', text, title = '', leadId = '', author, authorName = '', decision = '', reason = '', suggestion = '' }) => ({
  recordKey: `${WHATSAPP_TEST.prefix}${at}#${id}`,
  direction, to, partnerId, text: text.slice(0, WHATSAPP_TEST.textLimit), title, leadId, author, authorName, createdAt: at,
  decision, reason, suggestion: suggestion.slice(0, WHATSAPP_TEST.textLimit),
});

// Número canónico: só dígitos, sem o prefixo internacional «00» («00351…» e «351…» são a mesma conversa).
export const canonicalNumber = value => String(value ?? '').replace(/\D/g, '').replace(/^00/, '');

// Registos antigos guardados com «00» juntam-se à conversa certa ao serem lidos.
export const toInboxMessage = item => ({
  at: s(item, 'createdAt'), direction: s(item, 'direction'), to: canonicalNumber(s(item, 'to')), partnerId: s(item, 'partnerId'), text: s(item, 'text'),
  title: s(item, 'title'), leadId: s(item, 'leadId'), author: s(item, 'author'), authorName: s(item, 'authorName'),
  decision: s(item, 'decision'), reason: s(item, 'reason'), suggestion: s(item, 'suggestion'),
});

/**
 * Agrupa por conversa, a mais recente primeiro. Uma conversa cuja última mensagem veio de fora
 * e não foi respondida automaticamente espera por uma pessoa.
 */
export function threads(messages, partners = []) {
  const byKey = new Map();
  for (const message of [...messages].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = threadKey(message);
    if (!key) continue;
    const thread = byKey.get(key) ?? { key, to: message.to, partnerId: '', leadId: '', messages: [] };
    thread.messages.push(message);
    if (message.leadId) thread.leadId = message.leadId;
    if (message.partnerId) thread.partnerId = message.partnerId;
    byKey.set(key, thread);
  }
  return [...byKey.values()].map(thread => {
    const partner = partners.find(item => item.id === thread.partnerId || (thread.to && item.whatsapp === thread.to));
    const last = thread.messages.at(-1);
    return {
      ...thread,
      partnerId: partner?.id ?? thread.partnerId,
      name: partner?.name ?? '',
      audience: partner ? 'partner' : 'traveller',
      waiting: last.direction === 'in' && last.decision !== 'stop',
      stopped: thread.messages.some(message => message.decision === 'stop'),
    };
  }).sort((a, b) => b.messages.at(-1).at.localeCompare(a.messages.at(-1).at));
}

/** Mensagem escrita na intranet: resposta da BLU ("out") ou resposta simulada de fora ("in"). */
export function parseInboxPost(body, validLeadId, partners = []) {
  const direction = body.direction === 'in' ? 'in' : body.direction === 'out' ? 'out' : '';
  const partnerId = typeof body.partnerId === 'string' && body.partnerId ? body.partnerId : '';
  const partner = partners.find(item => item.id === partnerId);
  const to = canonicalNumber(body.to ?? partner?.whatsapp ?? '');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const leadId = typeof body.leadId === 'string' && body.leadId ? body.leadId : '';
  if (!direction) return { error: 'Escolha quem escreve a mensagem.' };
  if (partnerId && !partner) return { error: 'Parceiro desconhecido.' };
  // Um número internacional (E.164) tem 9 a 15 dígitos com o indicativo do país.
  if (!partner && to && !/^\d{9,15}$/.test(to)) return { error: 'Número inválido: use o indicativo do país e 9 a 15 dígitos, por exemplo 351912345678.' };
  if (!partner && !leadId && !to) return { error: 'Escolha um cliente da lista ou indique o número com o indicativo do país, por exemplo 351912345678.' };
  if (to && !/^\d{9,15}$/.test(to)) return { error: 'Número do parceiro inválido.' };
  if (!text) return { error: 'Escreva a mensagem.' };
  if (leadId && !validLeadId(leadId)) return { error: 'Referência de lead inválida.' };
  return { message: { direction, to, partnerId: partner?.id ?? '', text: text.slice(0, WHATSAPP_TEST.textLimit), leadId } };
}
