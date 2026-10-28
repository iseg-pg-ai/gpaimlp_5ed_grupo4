// Prepara texto legível para apresentação, mantendo os identificadores técnicos nos
// contratos internos.
/** Apresentação do texto gerado; nunca altera o snapshot, os hashes ou as regras. */
export function presentationText(value: string): string {
  return value
    .replace(/\b(?:[a-z_]+:)?cat-[a-f0-9]{16,64}\b/gi, "atividade")
    .replace(/\bR\d{2}(?:[–-]R?\d{2})?:\s*/g, "")
    .replace(/\s*\([^)]*\bR\d{2}[^)]*\)/g, "");
}

export function dayDescription(value?: string): string {
  if (!value) return "";
  // O resumo técnico antigo continua guardado para auditoria, mas não é uma descrição do dia.
  if (/^R01: até \d+ sugestões; R03: início /u.test(value)) {
    return value.includes("Sem sugestões compatíveis disponíveis")
      ? "Sem sugestões compatíveis disponíveis: requer curadoria manual."
      : "";
  }
  return presentationText(value);
}

export function activitySource(value?: string): string {
  if (!value) return "";
  const url = value.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (url) return url.replace(/[.,;]+$/, "");
  if (
    /cat-[a-f0-9]+|\blinha\s+\d|\.(?:xlsx|sqlite|jsonl)\b|_source_|^(?:atracoes|restaurantes|experiencias)\s*[·,:]/i.test(
      value,
    )
  )
    return "";
  return value;
}
