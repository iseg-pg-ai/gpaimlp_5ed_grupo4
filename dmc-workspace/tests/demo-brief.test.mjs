import assert from "node:assert/strict";
import test from "node:test";

import { initialBrief } from "../src/data/initialBrief.ts";
import { validateBrief } from "../src/lib/curation.ts";

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
