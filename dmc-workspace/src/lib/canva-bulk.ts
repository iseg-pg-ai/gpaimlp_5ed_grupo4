import type { Snapshot, VersionMeta } from "./itinerary-pdf";

// Ficheiro para a «Criação em massa» (Bulk create) do Canva: uma linha por dia da versão guardada,
// para o Canva preencher uma página do modelo BLU por dia. Mesmas regras do TXT: sem contactos,
// referências de reserva nem notas internas; pendências ficam visíveis. Orçamento e condições
// continuam no TXT/PDF, porque não cabem numa página por dia.
export const CANVA_BULK_COLUMNS = [
  "viagem",
  "cliente",
  "periodo",
  "dia",
  "data",
  "titulo",
  "local",
  "resumo",
  "programa",
  "pendencias",
  "versao",
] as const;

// Células que começam por = + - @ seriam fórmulas numa folha de cálculo: ficam como texto.
const cell = (value: unknown) => {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const programme = (day: Snapshot["itinerary"][number]) =>
  day.items
    .map((item) =>
      [item.time, item.title, item.location ? `(${item.location})` : ""].filter(Boolean).join(" · "),
    )
    .join("\n");

const checks = (day: Snapshot["itinerary"][number]) =>
  [...new Set(day.items.flatMap((item) => item.pendingChecks ?? []))].join("\n");

export function canvaBulkCsv(snapshot: Snapshot, meta: Pick<VersionMeta, "version">) {
  const { brief } = snapshot;
  const period = [brief.startDate, brief.endDate].filter(Boolean).join(" – ");
  const rows = snapshot.itinerary.map((day) => [
    brief.destination,
    brief.customerName,
    period,
    `Dia ${day.dayNumber}`,
    day.date,
    day.title,
    day.location,
    day.summary ?? "",
    programme(day),
    checks(day),
    `v${meta.version}`,
  ]);
  // BOM para o Excel e o Canva lerem acentos em UTF-8; fim de linha CRLF como pede o formato CSV.
  return "﻿" + [CANVA_BULK_COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
