import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDescription, activitySource, presentationText } from "../src/lib/presentation-text.ts";
import { renderLocalizedPdf } from "../src/lib/localized-pdf.ts";
import { renderPdf } from "../src/lib/itinerary-pdf.ts";
import { readFileSync } from "node:fs";

test("legacy day diagnostics are hidden without removing useful empty-day warnings", () => {
  const prefix = "R01: até 2 sugestões; R03: início Standard (09:30). ";
  assert.equal(
    dayDescription(
      prefix +
        "Horários propostos quando os dados permitem; intervalos estimados para deslocações e pausas. Itens por agendar requerem integração manual na agenda.",
    ),
    "",
  );
  assert.match(
    dayDescription(prefix + "Sem sugestões compatíveis disponíveis: requer curadoria manual."),
    /Sem sugestões compatíveis/,
  );
  assert.equal(
    dayDescription("Uma manhã em Belém, com pausas junto ao rio."),
    "Uma manhã em Belém, com pausas junto ao rio.",
  );
});
test("public sources remain usable while catalogue identifiers and sheet lineage are hidden", () => {
  assert.equal(
    activitySource(
      "atracoes · cat-d1ff8096796527adc4a9c6d8b5781494 · revisão 2 · https://example.org/visitar. Complemento: base.xlsx, folha, linha 2",
    ),
    "https://example.org/visitar",
  );
  assert.equal(activitySource("ATRACOES, linha 10"), "");
  assert.equal(activitySource("Visit Portugal"), "Visit Portugal");
  assert.equal(presentationText("R04: prioridade por interesses"), "prioridade por interesses");
});
test("new PDFs hide technical metadata while snapshots and confirmation warnings remain intact", async () => {
  const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  snapshot.itinerary[0].summary =
    "R01: até 2 sugestões; R03: início Standard (09:30). Horários propostos.";
  snapshot.itinerary[0].items[0].source =
    "atracoes · cat-d1ff8096796527adc4a9c6d8b5781494 · revisão 2";
  snapshot.itinerary[0].items[0].appliedRules = ["R04: prioridade por interesses"];
  const before = JSON.stringify(snapshot),
    capture = [];
  await renderPdf(
    snapshot,
    {
      tripId: "internal-trip-id",
      version: 2,
      filename: "test.pdf",
      createdAt: "2026-10-27T00:00:00Z",
      parentVersion: 1,
      snapshotHash: "a".repeat(64),
      chainHash: "b".repeat(64),
    },
    { capture },
  );
  assert.equal(JSON.stringify(snapshot), before);
  assert.doesNotMatch(capture.join("\n"), /R01|R04|cat-|SHA-256|internal-trip-id/);
  assert.match(capture.join("\n"), /Disponibilidade|Por confirmar|confirmação/);
});

test("PDF text and budget terms filter internal annotations in every delivery language", async () => {
  const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  const item = snapshot.itinerary[0].items[0];
  item.description = "R04: Visita cultural com acesso sujeito a confirmação.";
  item.priceNote = "10 EUR / pessoa (R33–R44)";
  item.pendingChecks = ["Confirmar abertura (R15)"];
  item.catalogDetails = {
    inclusions: "R04: Entrada incluída",
    exclusions: "Transporte (R05)",
    taxes: "Taxas por confirmar (R33)",
  };
  const original = JSON.stringify(snapshot);
  for (const locale of ["pt", "en", "es", "fr", "de"]) {
    const capture = [];
    await renderPdf(
      snapshot,
      {
        tripId: "internal-trip-id",
        version: 2,
        filename: "test.pdf",
        createdAt: "2026-10-27T00:00:00Z",
        parentVersion: 1,
        snapshotHash: "a".repeat(64),
        chainHash: "b".repeat(64),
      },
      { locale, capture },
    );
    assert.doesNotMatch(capture.join("\n"), /R04|R05|R15|R33|R44/);
    assert.match(capture.join("\n"), /Entrada incluída/);
    assert.match(capture.join("\n"), /Taxas por confirmar/);
  }
  assert.equal(JSON.stringify(snapshot), original);
});

test("localized delivery never sends internal metadata for translation", async () => {
  const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  snapshot.itinerary[0].items[0].description = "R04: Visita cultural";
  const requested = [];
  const translator = async (items) => {
    requested.push(...items.map((item) => item.text));
    return items.map((item) => item.text);
  };
  const bytes = await renderLocalizedPdf(
    snapshot,
    {
      tripId: "hidden-trip",
      version: 1,
      filename: "test.pdf",
      createdAt: "2026-10-27T00:00:00Z",
      parentVersion: null,
      snapshotHash: "a".repeat(64),
      chainHash: "b".repeat(64),
    },
    "en",
    translator,
  );
  assert.doesNotMatch(requested.join("\n"), /R04|SHA-256|hidden-trip|cat-/);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
});
