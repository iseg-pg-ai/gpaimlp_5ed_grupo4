import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { renderPdf } from "../src/lib/itinerary-pdf.ts";
const snapshot = JSON.parse(
  readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
);
const meta = {
  tripId: "presentation-test",
  version: 3,
  filename: "BLU_Test_v003.pdf",
  createdAt: "2026-10-03T12:00:00Z",
  parentVersion: 2,
  snapshotHash: "a".repeat(64),
  chainHash: "b".repeat(64),
};
test("presentation retains identity, proposal status and day sequence in every layout", async () => {
  const capture = [];
  await renderPdf(snapshot, meta, { capture });
  for (const text of [
    snapshot.brief.customerName,
    snapshot.brief.destination,
    "ROTEIRO · PROPOSTA PRELIMINAR",
    "Versão v003",
    "A sua viagem",
    "Identificação da versão",
  ])
    assert.ok(capture.includes(text), text);
  for (const day of snapshot.itinerary)
    for (const item of day.items) assert.ok(capture.includes(item.title));
  for (const locale of ["pt", "en", "es", "fr", "de"]) {
    const translated = new Map(
      capture.map((text) => [text, locale === "pt" ? text : `${locale}: ${text} ${text}`]),
    );
    const result = await renderPdf(snapshot, meta, { locale, translations: translated });
    assert.ok(result.length > 10000);
    assert.match(result.toString("latin1"), /%%EOF/);
  }
});
test("long customer and activity descriptions paginate without changing the snapshot", async () => {
  const long = structuredClone(snapshot);
  long.brief.customerName = "Cliente com nome extenso ".repeat(20);
  long.itinerary[0].items[0].description = "Descrição longa da experiência cultural. ".repeat(150);
  const original = JSON.stringify(long);
  const capture = [];
  const result = await renderPdf(long, meta, { capture });
  assert.equal(JSON.stringify(long), original);
  assert.ok(capture.includes(long.itinerary[0].items[0].description));
  assert.match(result.toString("latin1"), /%%EOF/);
});

test(
  "Mandarin uses the same layout with a CJK font",
  { skip: !existsSync(process.env.BLU_PDF_CJK_FONT ?? "C:/Windows/Fonts/msyh.ttc") },
  async () => {
    const capture = [];
    await renderPdf(snapshot, meta, { capture });
    const translations = new Map(capture.map((t) => [t, "行程提案 · " + t]));
    const bytes = await renderPdf(snapshot, meta, { locale: "zh", translations });
    assert.ok(bytes.length > 10000);
    assert.match(bytes.toString("latin1"), /%%EOF/);
  },
);
