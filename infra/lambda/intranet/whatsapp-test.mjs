// Caixa de WhatsApp de teste: em modo "test" (o padrão até haver credenciais Meta) nada sai
// da AWS. Os lembretes que iriam por WhatsApp ficam aqui, e a equipa pode responder como BLU
// ou simular a resposta do cliente para testar o circuito completo.
export const WHATSAPP_TEST = {
  partition: 'WHATSAPP-TEST',
  prefix: 'WAMSG#',
  textLimit: 1000,
  delivery: 'test-inbox',
};

export const whatsappMode = value => (value === 'live' ? 'live' : 'test');

const s = (item, key) => item?.[key]?.S ?? '';

export const inboxRecord = ({ at, id, direction, to, text, title = '', leadId = '', author, authorName = '' }) => ({
  recordKey: `${WHATSAPP_TEST.prefix}${at}#${id}`,
  direction, to, text: text.slice(0, WHATSAPP_TEST.textLimit), title, leadId, author, authorName, createdAt: at,
});

export const toInboxMessage = item => ({
  at: s(item, 'createdAt'), direction: s(item, 'direction'), to: s(item, 'to'), text: s(item, 'text'),
  title: s(item, 'title'), leadId: s(item, 'leadId'), author: s(item, 'author'), authorName: s(item, 'authorName'),
});

/** Agrupa por número: uma conversa por destinatário, a mais recente primeiro. */
export function threads(messages) {
  const byNumber = new Map();
  for (const message of [...messages].sort((a, b) => a.at.localeCompare(b.at))) {
    const thread = byNumber.get(message.to) ?? { to: message.to, leadId: '', messages: [] };
    thread.messages.push(message);
    if (message.leadId) thread.leadId = message.leadId;
    byNumber.set(message.to, thread);
  }
  return [...byNumber.values()].sort((a, b) => b.messages.at(-1).at.localeCompare(a.messages.at(-1).at));
}

/** Mensagem escrita na intranet: resposta da BLU ("out") ou resposta simulada do cliente ("in"). */
export function parseInboxPost(body, validLeadId) {
  const direction = body.direction === 'in' ? 'in' : body.direction === 'out' ? 'out' : '';
  const to = String(body.to ?? '').replace(/\D/g, '');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const leadId = typeof body.leadId === 'string' && body.leadId ? body.leadId : '';
  if (!direction) return { error: 'Escolha quem escreve a mensagem.' };
  if (!/^\d{7,20}$/.test(to)) return { error: 'Número inválido: use dígitos internacionais, por exemplo 351912345678.' };
  if (!text) return { error: 'Escreva a mensagem.' };
  if (leadId && !validLeadId(leadId)) return { error: 'Referência de lead inválida.' };
  return { message: { direction, to, text: text.slice(0, WHATSAPP_TEST.textLimit), leadId } };
}
