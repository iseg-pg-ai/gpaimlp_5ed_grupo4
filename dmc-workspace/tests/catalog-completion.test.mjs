import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFields,
  groupProgress,
  validatePricing,
  formatPricing,
  visibleFields,
} from "../src/lib/catalog-schema.ts";

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
