// Normaliza o histórico recebido antes de o enviar ao concierge.
// Bedrock Converse rejects histories that start with the assistant or repeat a role,
// so the site's greeting and any unanswered turns are folded into a valid exchange.
export function conversationMessages(previous, message) {
  const turns = (Array.isArray(previous) ? previous.slice(-10) : [])
    .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string' && item.text.trim())
    .map(item => ({ role: item.role, text: item.text.trim().slice(0, 2000) }));
  turns.push({ role: 'user', text: message });
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const merged = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    if (last?.role === turn.role) last.text = `${last.text}\n\n${turn.text}`;
    else merged.push({ ...turn });
  }
  return merged.map(turn => ({ role: turn.role, content: [{ text: turn.text }] }));
}
