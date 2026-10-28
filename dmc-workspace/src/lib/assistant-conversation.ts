// Seleciona o contexto recente da conversa sem confundir histórico com instruções do
// sistema.
export type ConversationTurn = { sender: "user" | "assistant"; text: string };

// Só texto e papel; nunca copiar o objeto da viagem ou dados de confirmação.
export function recentConversation(value: unknown): ConversationTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("Histórico de conversa inválido.");
  const result: ConversationTurn[] = [];
  let remaining = 6000;
  for (const item of [...value].reverse()) {
    if (
      !item ||
      !["user", "assistant"].includes(item.sender) ||
      typeof item.text !== "string" ||
      item.text.length > 4000
    )
      throw new Error("Mensagem de contexto inválida.");
    const text = item.text.trim().slice(0, Math.min(1000, remaining));
    if (!text) continue;
    result.unshift({ sender: item.sender, text });
    remaining -= text.length;
    if (!remaining) break;
  }
  return result;
}
