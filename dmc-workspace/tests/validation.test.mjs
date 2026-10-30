import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialBrief } from "../src/data/initialBrief.ts";
import {
  emptyFields,
  groupProgress,
  validatePricing,
  formatPricing,
  visibleFields,
} from "../src/lib/catalog-schema.ts";
import { validateSnapshot } from "../src/lib/snapshot-validation.ts";
import { validateBrief } from "../src/lib/curation.ts";
import { validateCatalogDetails } from "../src/lib/catalog-details.ts";
import { responseJson } from "../src/lib/http-client.ts";

function snapshot() {
  const value = JSON.parse(
    readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
  );
  Object.assign(value.brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  return value;
}

test("legacy snapshots remain valid while malformed catalog details are rejected", () => {
  assert.doesNotThrow(() => validateSnapshot(snapshot()));
  for (const value of ["text", [], { location: "Lisboa" }, null])
    assert.throws(() => validateCatalogDetails(value));
  const value = snapshot();
  value.itinerary[0].items[0].catalogDetails = [];
  assert.throws(() => validateSnapshot(value));
});

test("snapshot rejects malformed lock and edit-origin states", () => {
  for (const mutate of [
    (value) => (value.itinerary[0].items[0].isLocked = "false"),
    (value) => (value.itinerary[0].items[0].isRecentlyModified = 1),
    (value) => (value.itinerary[0].items[0].lastModifiedBy = "model"),
    (value) => (value.itinerary[0].lastModifiedBy = "model"),
  ]) {
    const value = snapshot();
    mutate(value);
    assert.throws(() => validateSnapshot(value));
  }
});

test("flight logistics are optional, persisted and require valid clock times", () => {
  const value = snapshot().brief;
  assert.doesNotThrow(() => validateBrief(value));
  Object.assign(value, {
    arrivalTime: "10:35",
    arrivalFlightNumber: "TP 1363",
    departureTime: "17:20",
    departureFlightNumber: "TP 1931",
  });
  assert.doesNotThrow(() => validateBrief(value));
  value.arrivalTime = "25:80";
  assert.throws(() => validateBrief(value), /Hora inválida/);
});

test("API response handling retains server errors and handles non-JSON responses", async () => {
  assert.deepEqual(await responseJson(Response.json({ version: 2 })), { version: 2 });
  await assert.rejects(
    responseJson(Response.json({ error: "Conflict" }, { status: 409 })),
    /Conflict/,
  );
  await assert.rejects(
    responseJson(new Response("Bad gateway", { status: 502 })),
    /resposta inválida/,
  );
  await assert.rejects(responseJson(Response.json({}, { status: 400 })), /Pedido falhou/);
});

test("o exemplo de apresentação é uma viagem válida de seis dias entre Lisboa e Porto", () => {
  assert.doesNotThrow(() => validateBrief(initialBrief));
  const days =
    (Date.parse(initialBrief.endDate) - Date.parse(initialBrief.startDate)) / 86_400_000 + 1;
  assert.equal(days, 6);
  assert.match(initialBrief.arrivalLocation, /Lisbon|LIS/);
  assert.match(initialBrief.departureLocation, /Porto|OPO/);
  assert.equal(initialBrief.adults, 2);
  assert.equal(initialBrief.children, 0);
  assert.equal(initialBrief.currency, "EUR");
  assert.ok(initialBrief.interests.includes("Local Markets & Artisans"));
  assert.deepEqual(initialBrief.mobilityRestrictions, []);
  assert.deepEqual(initialBrief.dietaryRestrictions, []);
});

test("completion excludes optional and category-inapplicable fields", () => {
  const input = { category: "restaurantes", fields: { ...emptyFields(), name: "Local" } };
  assert.deepEqual(groupProgress(input, ["name", "description", "kind", "cuisine"]), {
    missing: ["description"],
    total: 2,
    percent: 50,
  });
  input.fields.description = "Descrição";
  assert.equal(groupProgress(input, ["name", "description", "kind", "cuisine"]).percent, 100);
  assert.ok(!visibleFields("restaurantes").includes("provider"));
});

test("unknown prices are not zero and malformed structured prices cannot complete a group", () => {
  const pricing = { amount: "", currency: "EUR", unit: "person", status: "pending" };
  assert.doesNotThrow(() => validatePricing(pricing));
  assert.match(formatPricing(pricing), /Valor por confirmar/);
  for (const invalid of [
    { ...pricing, status: "confirmed" },
    { ...pricing, amount: "-1" },
    { ...pricing, unit: "" },
    { ...pricing, currency: "€" },
  ]) {
    assert.throws(() => validatePricing(invalid));
    assert.ok(
      groupProgress({ category: "atracoes", fields: emptyFields(), pricing: invalid }, ["price"])
        .percent < 100,
    );
  }
  assert.doesNotThrow(() => validatePricing({ ...pricing, amount: "0", status: "confirmed" }));
  assert.equal(
    groupProgress({ category: "atracoes", fields: emptyFields(), pricing }, ["price"]).percent,
    100,
  );
});
