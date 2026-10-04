import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { editWithAssistant } from "../src/lib/assistant-editing.ts";
import { generateItinerary } from "../src/lib/curation.ts";
import { VersionStore } from "../src/lib/version-store.ts";
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
function setup() {
  const c = catalog();
  c.restaurantes = [];
  c.experiencias = [];
  c.atracoes = [row("Visit"), row("Other"), row("Third")];
  const snapshot = {
    brief,
    pending: [],
    itinerary: generateItinerary(brief, { ...c, atracoes: [c.atracoes[0]] }).itinerary,
  };
  return { c, snapshot };
}
test("budget, daily capacity and closed days are checked before accepting an addition", () => {
  const { c, snapshot } = setup();
  snapshot.brief = { ...brief, budget: 100 };
  for (const row of c.atracoes)
    row._pricing = { amount: "60", currency: "EUR", unit: "group", status: "confirmed" };
  assert.equal(editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c).changed, false);
  snapshot.brief.budget = 1000;
  c.atracoes[1].dias_de_encerramento = "Segunda-feira";
  assert.equal(editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c).changed, false);
  c.atracoes[1].dias_de_encerramento = "";
  snapshot.brief.pace = "Relaxed";
  const added = editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c);
  assert.equal(added.changed, true);
  assert.equal(
    editWithAssistant({ ...snapshot, itinerary: added.itinerary }, 'adicionar "Third" ao dia 1', c)
      .changed,
    false,
  );
});
test("assistant adds, replaces, reschedules, reorders and removes without mutating its input", () => {
  const { c, snapshot } = setup();
  const before = JSON.stringify(snapshot);
  const added = editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c);
  assert.equal(added.changed, true);
  assert.equal(added.itinerary[0].items.length, 2);
  const replaced = editWithAssistant(snapshot, 'substituir atividade 1 do dia 1 por "Third"', c);
  assert.equal(replaced.itinerary[0].items[0].title, "Third");
  const moved = editWithAssistant(snapshot, "reagendar atividade 1 do dia 1 para 14:00", c);
  assert.match(moved.itinerary[0].items[0].time, /14:00/);
  const reordered = editWithAssistant(
    { ...snapshot, itinerary: added.itinerary },
    "reorganizar dia 1 na ordem 2,1",
    c,
  );
  assert.equal(reordered.changed, true);
  assert.equal(reordered.itinerary[0].items[0].title, "Other");
  assert.equal(
    editWithAssistant(snapshot, "remover atividade 1 do dia 1", c).itinerary[0].items.length,
    0,
  );
  assert.equal(JSON.stringify(snapshot), before);
});
test("protected and confirmed activities cannot be removed, replaced, rescheduled or reordered", () => {
  for (const protection of [{ isLocked: true }, { confirmation: { status: "confirmed" } }]) {
    const { c, snapshot } = setup();
    Object.assign(snapshot.itinerary[0].items[0], protection);
    for (const input of [
      "remover atividade 1 do dia 1",
      "remover última atividade do dia 1",
      'substituir atividade 1 do dia 1 por "Other"',
      "reagendar atividade 1 do dia 1 para 14:00",
      "reorganizar dia 1 na ordem 1",
    ]) {
      const result = editWithAssistant(snapshot, input, c);
      assert.equal(result.changed, false);
      assert.equal(result.itinerary, snapshot.itinerary);
    }
  }
});
test("assistant refuses duplicates, ambiguous names, exclusions, unpublished offers and impossible schedules", () => {
  const { c, snapshot } = setup();
  for (const input of [
    'adicionar "Visit" ao dia 1',
    'adicionar "Missing" ao dia 1',
    "reagendar atividade 1 do dia 1 para 23:00",
    "reorganizar dia 1 na ordem 1,1",
    "remover atividade 9 do dia 1",
  ])
    assert.equal(editWithAssistant(snapshot, input, c).changed, false);
  c.atracoes[1]._catalog_status = "draft";
  assert.equal(editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c).changed, false);
  c.atracoes[1]._catalog_status = "approved";
  c.atracoes[1].nome_da_atracao = "Museu Other";
  snapshot.brief = { ...brief, exclusions: ["No Standard Large Museums"] };
  assert.equal(editWithAssistant(snapshot, 'adicionar "Museu Other" ao dia 1', c).changed, false);
});
test("overlap and unknown opening data leave the itinerary intact", () => {
  const { c, snapshot } = setup();
  const added = editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c);
  const withTwo = { ...snapshot, itinerary: added.itinerary };
  assert.equal(
    editWithAssistant(withTwo, "reagendar atividade 1 do dia 1 para 14:00", c).changed,
    false,
  );
  c.atracoes[0].horario = "mediante pedido";
  assert.equal(
    editWithAssistant(snapshot, "reagendar atividade 1 do dia 1 para 14:00", c).changed,
    false,
  );
});
test("changed proposal enters immutable version history", () => {
  const { c, snapshot } = setup();
  const root = mkdtempSync(path.join(tmpdir(), "blu-assistant-"));
  const store = new VersionStore(root);
  try {
    store.save("assistant", snapshot, "generated", null);
    const result = editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c);
    store.save("assistant", { ...snapshot, itinerary: result.itinerary }, "edited", 1);
    assert.equal(JSON.parse(store.get("assistant", 1).snapshot).itinerary[0].items.length, 1);
    assert.equal(JSON.parse(store.get("assistant", 2).snapshot).itinerary[0].items.length, 2);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("assistant optimizes day route sequence on request", () => {
  const { c, snapshot } = setup();
  const added1 = editWithAssistant(snapshot, 'adicionar "Other" ao dia 1', c);
  const withTwo = { ...snapshot, itinerary: added1.itinerary };
  const added2 = editWithAssistant(withTwo, 'adicionar "Third" ao dia 1', c);
  const withThree = { ...snapshot, itinerary: added2.itinerary };
  assert.equal(withThree.itinerary[0].items.length, 3);

  const optimized = editWithAssistant(withThree, "otimizar rota do dia 1", c);
  assert.equal(optimized.changed, true);
  assert.match(optimized.reply, /Rota do dia 1 otimizada/);
  assert.equal(optimized.itinerary[0].items.length, 3);
});
