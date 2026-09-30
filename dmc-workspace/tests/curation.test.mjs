import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateItinerary, validateBrief, applyCommand } from "../src/lib/curation.ts";
const catalog = Object.fromEntries(["atracoes", "experiencias", "restaurantes", "curation_rules"].map(name => [name, readFileSync(new URL(`../../warehouse/${name}.jsonl`, import.meta.url), "utf8").trim().split(/\r?\n/).map(JSON.parse)]));
// Curator approval is explicit test setup, independent of local portal data.
for (const name of ['atracoes', 'experiencias', 'restaurantes']) for (const row of catalog[name]) { row._catalog_status = 'approved'; delete row._catalog_id; }
const brief = { customerName: "Test", destination: "Lisboa", startDate: "2026-10-10", endDate: "2026-10-12", arrivalLocation: "Lisboa", departureLocation: "Lisboa", adults: 2, children: 0, childrenAges: "", budget: 2000, currency: "EUR", interests: ["Culture & Heritage"], pace: "Relaxed", accommodation: "Boutique", proposalTier: "Soft", physicalEffort: "Baixo (Low)", mobilityRestrictions: [], dietaryRestrictions: [], diningPace: "Relaxed Dining (~90m)", morningPreference: "Late Start (10:30+)", exclusions: [], specialOccasion: "", notes: "" };
test("actual catalog, calendar dates, provenance and no repeated activities", () => {
 const result = generateItinerary(brief, catalog);
 assert.equal(result.itinerary.length, 3);
 assert.equal(result.itinerary[2].date, "2026-10-12");
 const items = result.itinerary.flatMap(d => d.items);
 assert.ok(items.length);
 assert.equal(new Set(items.map(i => i.id)).size, items.length);
 assert.ok(items.every(i => i.source && i.pendingChecks.length && i.time === "Por agendar"));
});
test("invalid date ranges and unknown destinations fail explicitly", () => {
 assert.throws(() => validateBrief({...brief, endDate: "2026-10-09"}));
 assert.throws(() => validateBrief({...brief, startDate: "2026-02-30"}));
 assert.throws(() => generateItinerary({...brief, destination: "Italy"}, catalog));
});
test('only explicitly approved records enter generation', () => {
 const blocked = { ...catalog, atracoes: catalog.atracoes.map(r => ({ ...r, _catalog_status: 'review' })), experiencias: catalog.experiencias.map(r => ({ ...r, _catalog_status: 'draft' })), restaurantes: catalog.restaurantes.map(r => ({ ...r, _catalog_status: 'inactive' })) };
 assert.equal(generateItinerary(brief, blocked).itinerary.flatMap(d => d.items).length, 0);
 for (const rows of [blocked.atracoes, blocked.experiencias, blocked.restaurantes]) for (const row of rows) delete row._catalog_status;
 assert.equal(generateItinerary(brief, blocked).itinerary.flatMap(d => d.items).length, 0);
});
test("museum exclusion and low effort are enforced", () => {
 const result = generateItinerary({...brief, exclusions: ["No Standard Large Museums"]}, catalog);
 for (const item of result.itinerary.flatMap(d => d.items)) {
   assert.doesNotMatch(item.title.toLowerCase(), /museu/);
   if (item.id.startsWith("atracoes:")) {
     const row = catalog.atracoes.find(r => `atracoes:${r.id}` === item.id);
     assert.notEqual(row.esforco_fisico, "Alto");
     assert.notEqual(row.esforco_fisico, "Moderado");
   }
 }
});
test("dietary restrictions withhold food suggestions and disclose uncertainty", () => {
 const result = generateItinerary({...brief, dietaryRestrictions: ["Shellfish Allergy"]}, catalog);
 assert.ok(result.pending.some(p => p.includes("contaminação")));
 assert.ok(result.itinerary.flatMap(d => d.items).every(i => i.category !== "restaurant"));
});
test("tiers and interests affect ranking without increasing daily count", () => {
 const soft = generateItinerary(brief, catalog);
 const signature = generateItinerary({...brief, proposalTier: "Signature", interests: ["Fado & Traditional Music"]}, catalog);
 assert.notDeepEqual(soft.itinerary[0].items.map(i => i.id), signature.itinerary[0].items.map(i => i.id));
 assert.ok(signature.itinerary.every(d => d.items.length <= 2));
});
test("missing rules fail closed and empty catalog produces gaps", () => {
 assert.throws(() => generateItinerary(brief, {...catalog, curation_rules: []}));
 const result = generateItinerary(brief, {...catalog, atracoes: [], restaurantes: [], experiencias: []});
 assert.ok(result.itinerary.every(d => d.items.length === 0 && d.summary.includes("curadoria manual")));
});

test("unsupported commands and locks never mutate the itinerary", () => {
 const days = generateItinerary(brief, catalog).itinerary;
 days[0].items.at(-1).isLocked = true;
 const snapshot = JSON.stringify(days);
 assert.equal(applyCommand(days, "Remover última atividade do dia 1").itinerary, days);
 assert.equal(applyCommand(days, "reduce budget").itinerary, days);
 assert.equal(JSON.stringify(days), snapshot);
});
test("supported removal preserves other days and the original snapshot", () => {
 const days = generateItinerary(brief, catalog).itinerary;
 const count = days[0].items.length;
 const result = applyCommand(days, "Remover última atividade do dia 1");
 assert.equal(result.itinerary[0].items.length, count - 1);
 assert.equal(days[0].items.length, count);
 assert.equal(result.itinerary[1], days[1]);
});

test("mobility limitations override a high-effort preference", () => {
 const row = {...catalog.atracoes[0], cidade: "Lisboa", esforco_fisico: "Alto"};
 const result = generateItinerary({...brief, physicalEffort: "Alto (High)", mobilityRestrictions: ["Avoid Steep Stairs (Lisbon/Porto Calçada)"]}, {...catalog, atracoes: [row], experiencias: [], restaurantes: []});
 assert.ok(result.itinerary.every(d => d.items.length === 0));
});
