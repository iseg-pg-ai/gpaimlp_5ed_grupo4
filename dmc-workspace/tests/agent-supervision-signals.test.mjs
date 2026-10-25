import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agentSupervisionSignals } from "../src/lib/agent-supervision-signals.ts";

const fixture = () => JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));

test("sinais distinguem chuva histórica, perturbação reportada e revisão de conteúdo", () => {
  const snapshot = fixture();
  const item = snapshot.itinerary[0].items[0];
  item.id = `atracoes:${item.id}`;
  const catalog = {
    atracoes: [
      {
        _catalog_id: item.id.split(":").slice(1).join(":"),
        nome_da_atracao: item.title,
        cidade: snapshot.itinerary[0].location,
        descricao_curada: "Descrição de 2024 with mixed language",
        site_fonte: "",
        horario: "",
        dias_de_encerramento: "",
      },
    ],
    restaurantes: [],
    experiencias: [],
    curation_rules: [],
  };
  const signals = agentSupervisionSignals(
    snapshot,
    catalog,
    [{ dayNumber: 1, isRainy: true, evidence: "historical_reference" }],
    "O fornecedor cancelou e o voo está atrasado",
  );
  assert.ok(
    signals.some(
      (signal) => signal.code === "RAIN_REVIEW" && signal.evidence === "historical_reference",
    ),
  );
  assert.ok(signals.some((signal) => signal.code === "CONTENT_FIELDS_MISSING"));
  assert.ok(signals.some((signal) => signal.code === "CONTENT_DATE_MAY_BE_STALE"));
  assert.ok(signals.some((signal) => signal.code === "CONTENT_LANGUAGE_MIXED"));
  assert.ok(signals.some((signal) => signal.code === "CANCELLATION_REPORTED"));
  assert.ok(signals.some((signal) => signal.code === "DELAY_REPORTED"));
});
