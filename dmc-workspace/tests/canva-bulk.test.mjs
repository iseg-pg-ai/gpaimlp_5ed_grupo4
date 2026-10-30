import test from "node:test";
import assert from "node:assert/strict";
import { CANVA_BULK_COLUMNS, canvaBulkCsv } from "../src/lib/canva-bulk.ts";

const snapshot = {
  brief: {
    customerName: "Ana Silva",
    customerEmail: "ana@example.com",
    destination: "Lisboa e Sintra",
    startDate: "2027-05-10",
    endDate: "2027-05-12",
    notes: "Nota interna: cliente difícil",
  },
  itinerary: [
    {
      dayNumber: 1,
      date: "2027-05-10",
      title: 'Chegada e "Alfama"',
      location: "Lisboa",
      summary: '=HYPERLINK("x")',
      items: [
        {
          id: "a",
          time: "09:30",
          title: "Recolha no aeroporto",
          location: "LIS",
          category: "transport",
          pendingChecks: ["Confirmar voo"],
        },
        {
          id: "b",
          time: "15:00",
          title: "Passeio de tuk-tuk",
          category: "activity",
          confirmation: { reference: "RES-123" },
        },
      ],
    },
    { dayNumber: 2, date: "2027-05-11", title: "Sintra", location: "Sintra", items: [] },
  ],
  pending: [],
};

test("o ficheiro do Canva tem uma linha por dia, sem contactos nem notas internas", () => {
  const csv = canvaBulkCsv(snapshot, { version: 3 });
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], CANVA_BULK_COLUMNS.map((column) => `"${column}"`).join(","));
  // Linhas com quebras dentro das células: contar os dias pelo início de cada registo.
  assert.equal((csv.match(/\r\n"Lisboa e Sintra",/g) ?? []).length, 2);
  assert.match(csv, /"Dia 1","2027-05-10","Chegada e ""Alfama""","Lisboa"/);
  assert.match(csv, /"09:30 · Recolha no aeroporto · \(LIS\)\n15:00 · Passeio de tuk-tuk"/);
  assert.match(csv, /"Confirmar voo"/);
  assert.match(csv, /"v3"/);
  // Fórmulas neutralizadas; contactos, notas e referências de reserva de fora.
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.doesNotMatch(csv, /ana@example\.com|Nota interna|RES-123/);
});
