// Executar contra uma instância isolada com planeador simulado, nunca com dados reais.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = process.env.PORTAL_URL;
if (!base || process.env.BLU_AGENT_API_TEST !== "1")
  throw new Error(
    "Definir PORTAL_URL e BLU_AGENT_API_TEST=1 apenas numa instância isolada com planeador simulado.",
  );
const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
Object.assign(snapshot.brief, {
  childrenAges: "",
  specialOccasion: "",
  notes: "",
  accommodation: "Boutique",
  diningPace: "Relaxed Dining (~90m)",
});
for (const day of snapshot.itinerary) {
  day.dailyCapacity = 6;
  for (const item of day.items) {
    item.isLocked = false;
    delete item.confirmation;
  }
}
const tripId = `agent-api-${Date.now()}`;
const post = async (path, body, status = 200, headers = {}) => {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
};
const versions = async () => (await fetch(`${base}/api/versions?tripId=${tripId}`)).json();
await post("/api/versions", { tripId, snapshot, baseVersion: null, reason: "generated" });
const request = { tripId, snapshot, baseVersion: 1, input: "Pedido sintético" };
await post("/api/assistant/plan", { ...request, input: "SIMULAR_FALHA" }, 503);
assert.equal((await versions()).length, 1);
await post("/api/assistant/plan", request, 403, { Origin: "https://untrusted.example" });
await post("/api/assistant/plan", { ...request, input: "" }, 400);
const rejected = await post("/api/assistant/plan", request);
assert.equal((await versions()).length, 1);
assert.deepEqual(rejected.before, snapshot.itinerary);
await post("/api/assistant/plan", {
  tripId,
  baseVersion: 1,
  runId: rejected.runId,
  decision: "reject",
});
assert.equal((await versions()).length, 1);
const proposal = await post("/api/assistant/plan", request);
const stale = await post("/api/assistant/plan", request);
const accepted = await post("/api/assistant/plan", {
  tripId,
  baseVersion: 1,
  runId: proposal.runId,
  decision: "accept",
});
assert.equal(accepted.version, 2);
assert.equal(accepted.snapshot.itinerary[0].items.length, snapshot.itinerary[0].items.length - 1);
assert.equal((await versions()).length, 2);
await post(
  "/api/assistant/plan",
  { tripId, baseVersion: 1, runId: proposal.runId, decision: "accept" },
  409,
);
await post(
  "/api/assistant/plan",
  { tripId, baseVersion: 1, runId: stale.runId, decision: "accept" },
  409,
);
await post("/api/assistant/plan", request, 409);
console.log("API real com planeador simulado: proposta, rejeição, versão, origem e conflitos OK");
