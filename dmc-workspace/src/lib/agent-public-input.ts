// Seleciona os campos de conversa que podem atravessar a fronteira pública do agente.
type Turn = { sender: "user" | "assistant"; text: string };

/** Remove contactos diretos antes de qualquer contexto chegar ao fornecedor. */
export function publicAgentText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contacto removido]")
    .replace(/(?:\+?\d[\s().-]*){9,}/g, "[contacto removido]");
}

export function publicAgentConversation(turns: Turn[]): Turn[] {
  return turns.map((turn) => ({ ...turn, text: publicAgentText(turn.text) }));
}
