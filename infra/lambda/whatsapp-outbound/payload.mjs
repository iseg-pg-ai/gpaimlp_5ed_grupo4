// Constrói o corpo do pedido WhatsApp sem aceder aos segredos do canal.
const safe = (value, maximum) => String(value || '').trim().slice(0, maximum);

export function buildWhatsAppPayload(input) {
  const to = safe(input.to, 20);
  if (!/^\d{7,20}$/.test(to)) throw new Error('to must be an international WhatsApp number containing digits only');
  if (!safe(input.approvedBy, 120)) throw new Error('approvedBy is required');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(safe(input.conversationId, 80))) throw new Error('a valid conversationId is required');
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(safe(input.requestId, 120))) throw new Error('a stable requestId is required');
  if (input.kind === 'template') {
    const name = safe(input.template?.name, 512);
    const languageCode = safe(input.template?.languageCode, 20);
    if (!/^[a-z0-9_]+$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)) throw new Error('template name and languageCode are required');
    return {
      api: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name, language: { code: languageCode }, ...(Array.isArray(input.template.components) ? { components: input.template.components } : {}) } },
      timelineText: `[WhatsApp template ${name}]`,
      contentKind: 'template',
    };
  }
  const text = safe(input.text, 4096);
  if (!text) throw new Error('text is required');
  return {
    api: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } },
    timelineText: text,
    contentKind: 'text',
  };
}
