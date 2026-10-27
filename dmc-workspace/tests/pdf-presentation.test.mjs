import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPdf, resolveChineseFont } from "../src/lib/itinerary-pdf.ts";
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
  Object.assign(snapshot.brief, {
    arrivalTime: "10:35",
    arrivalFlightNumber: "TP 1363",
    departureTime: "17:20",
    departureFlightNumber: "TP 1931",
  });
  const capture = [];
  await renderPdf(snapshot, meta, { capture });
  for (const text of [
    snapshot.brief.customerName,
    snapshot.brief.destination,
    "ROTEIRO · PROPOSTA PRELIMINAR",
    "Versão v003",
    "A sua viagem",
    `Chegada: ${snapshot.brief.arrivalLocation} | Hora: 10:35 | Voo: TP 1363`,
    `Partida: ${snapshot.brief.departureLocation} | Hora: 17:20 | Voo: TP 1931`,
  ])
    assert.ok(capture.includes(text), text);
  assert.ok(!capture.join("\n").includes(meta.tripId));
  assert.ok(!capture.join("\n").includes("SHA-256"));
  for (const day of snapshot.itinerary)
    for (const item of day.items) assert.ok(capture.includes(item.title));
  for (const locale of ["pt", "en", "es", "fr", "de"]) {
    const translated = new Map(
      capture.map((text) => [text, locale === "pt" ? text : `${locale}: ${text} ${text}`]),
    );
    const result = await renderPdf(snapshot, meta, { locale, translations: translated });
    assert.equal(result.subarray(0, 5).toString("ascii"), "%PDF-");
    const xref = /startxref\s+(\d+)\s+%%EOF/.exec(result.toString("latin1"));
    assert.ok(xref, `Missing PDF cross-reference offset for ${locale}`);
    assert.equal(result.subarray(Number(xref[1]), Number(xref[1]) + 4).toString(), "xref");
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

test("Mandarin uses the same layout with a CJK font", { skip: !resolveChineseFont() }, async () => {
  const capture = [];
  await renderPdf(snapshot, meta, { capture });
  const translations = new Map(capture.map((t) => [t, "行程提案 · " + t]));
  const bytes = await renderPdf(snapshot, meta, { locale: "zh", translations });
  assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(bytes.toString("latin1"), /%%EOF/);
});
