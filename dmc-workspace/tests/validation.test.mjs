import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSnapshot } from "../src/lib/snapshot-validation.ts";
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
