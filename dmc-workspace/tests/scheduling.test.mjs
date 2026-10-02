import { datedWindows, closureState, transferEstimate } from "../src/lib/itinerary-scheduling.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateItinerary } from "../src/lib/curation.ts";
import {
  durationMinutes,
  openingWindows,
  closedOn,
  knownCost,
} from "../src/lib/itinerary-scheduling.ts";
const brief = {
  ...JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8")).brief,
  childrenAges: "",
  specialOccasion: "",
  notes: "",
  accommodation: "Boutique",
  diningPace: "Relaxed Dining (~90m)",
  children: 0,
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  exclusions: [],
  pace: "Balanced",
  startDate: "2026-10-05",
  endDate: "2026-10-05",
  destination: "Lisboa",
};
const row = (id) => ({
  id,
  _catalog_status: "approved",
  _source_row: 1,
  cidade: "Lisboa",
  nome_da_atracao: id,
  nome_da_experiencia: id,
  estabelecimento: id,
  esforco_fisico: "Baixo",
  horario: "Todos os dias 09:00–18:00",
  tempo_medio_de_visita: "60 min",
  duracao: "60 min",
  duracao_blu_estimativa: "60 min",
});
const catalog = () => ({
  atracoes: [row("Visit")],
  experiencias: [row("Experience")],
  restaurantes: [row("Lunch")],
  curation_rules: ["R01", "R03", "R04", "R05", "R09", "R15", "R16", "R33", "R40", "R41", "R43"].map(
    (id) => ({ id }),
  ),
});
test("duration and opening parsers reject ambiguous and overnight schedules", () => {
  assert.equal(durationMinutes("1h30–2h"), 120);
  assert.equal(durationMinutes("20–30 min"), 30);
  assert.equal(durationMinutes("1h90"), null);
  assert.equal(durationMinutes("2h–1h"), null);
  assert.equal(durationMinutes("mediante pedido"), null);
  assert.deepEqual(openingWindows("09:00–12:00; 14:00–18:00"), [
    [540, 720],
    [840, 1080],
  ]);
  assert.equal(openingWindows("09h–21h (mar.–out.)"), null);
  assert.equal(openingWindows("22:00–02:00"), null);
  assert.ok(closedOn({ dias_de_encerramento: "Segunda-feira" }, "2026-10-05"));
});
test("eligible categories are diversified and proposed slots do not overlap", () => {
  const result = generateItinerary(brief, catalog());
  const items = result.itinerary[0].items;
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map((i) => i.id.split(":")[0])).size, 3);
  let end = 0;
  for (const item of items) {
    const m = item.time.match(/^(\d\d):(\d\d)–(\d\d):(\d\d) \(proposto\)$/);
    assert.ok(m);
    const start = Number(m[1]) * 60 + Number(m[2]);
    assert.ok(start >= end);
    end = Number(m[3]) * 60 + Number(m[4]);
    assert.ok(end <= 1080);
    assert.equal(item.confirmation, undefined);
  }
  assert.match(items.find((i) => i.category === "restaurant").time, /^12:00–13:30/);
  assert.ok(items.every((i) => i.priceNote.includes("custo total por confirmar")));
});
test("closed or impossible visits are excluded; ambiguous hours remain unscheduled", () => {
  const data = catalog();
  data.atracoes[0].dias_de_encerramento = "Segunda-feira";
  data.experiencias[0].horario = "09:00–09:30";
  const items = generateItinerary(brief, data).itinerary[0].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].category, "restaurant");
  data.restaurantes[0].horario = "Sazonal";
  assert.equal(generateItinerary(brief, data).itinerary[0].items[0].time, "Por agendar");
});
test("unknown price is distinct from free and group pricing is not multiplied", () => {
  assert.equal(knownCost({}, 4), null);
  assert.equal(
    knownCost(
      { _pricing: { amount: "0", currency: "EUR", unit: "person", status: "confirmed" } },
      4,
    ),
    0,
  );
  assert.equal(
    knownCost(
      { _pricing: { amount: "100", currency: "EUR", unit: "group", status: "estimated" } },
      4,
    ),
    100,
  );
  assert.equal(
    knownCost(
      { _pricing: { amount: "100", currency: "USD", unit: "person", status: "confirmed" } },
      4,
    ),
    null,
  );
  assert.equal(
    knownCost(
      { _pricing: { amount: "100", currency: "EUR", unit: "person", status: "pending" } },
      4,
    ),
    null,
  );
});

test("dataset seasonal schedules, weekdays and specific closure dates are respected", () => {
  assert.deepEqual(datedWindows("09h–21h (mar.–out.); 09h–18h (nov.–fev.)", "2026-10-05"), [
    [540, 1260],
  ]);
  assert.deepEqual(datedWindows("09h–21h (mar.–out.); 09h–18h (nov.–fev.)", "2026-12-05"), [
    [540, 1080],
  ]);
  assert.deepEqual(datedWindows("Ter–sáb 12:00–00:00; dom 12:00–23:00", "2026-10-05"), []);
  assert.equal(closureState("1 jan.; 1 maio; 24, 25 e 31 dez.", "2026-12-25"), "closed");
  assert.equal(closureState("1 jan.; 1 maio; 24, 25 e 31 dez.", "2026-10-05"), "open");
  assert.equal(closureState("Sujeito ao culto", "2026-10-05"), "unknown");
});
test("coordinate estimates increase the margin without claiming measured routes", () => {
  const estimate = transferEstimate(
    { latitude: 38.7, longitude: -9.1 },
    { latitude: 39.2, longitude: -9.1 },
    30,
  );
  assert.ok(estimate.minutes > 30);
  assert.match(estimate.note, /linha reta/);
  assert.equal(
    transferEstimate({ latitude: null, longitude: null }, { latitude: 0, longitude: 0 }, 30)
      .minutes,
    30,
  );
});
