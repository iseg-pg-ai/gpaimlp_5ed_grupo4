// Executar apenas numa instância local isolada com sitecustomize de teste fora do projeto.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.env.PORTAL_URL;
if (!base || process.env.BLU_AGENT_API_TEST !== "1")
  throw new Error(
    "Definir PORTAL_URL e BLU_AGENT_API_TEST=1 para a instância isolada com fornecedor simulado.",
  );
const origin = new URL(base);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  throw new Error("Este teste só aceita instâncias loopback, nunca o portal operacional.");

const fixture = () => {
  const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  Object.assign(snapshot.brief, {
    customerName: "Cliente sintético",
    childrenAges: "",
    specialOccasion: "",
    notes: "NOTA_INTERNA_SINTETICA",
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
  return snapshot;
};

const post = async (route, body, status = 200, headers = {}) => {
  const response = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, `${route}: ${JSON.stringify(result)}`);
  assert.ok(!JSON.stringify(result).includes("DETALHE_PRIVADO_FORNECEDOR"));
  return result;
};

// Os botões manuais continuam determinísticos e não invocam o planeador.
const manualSnapshot = fixture();
const manual = await post("/api/itinerary/edit", {
  snapshot: manualSnapshot,
  input: "remover atividade 1 do dia 1",
});
assert.equal(manual.changed, true);
assert.equal(manual.itinerary[0].items.length, manualSnapshot.itinerary[0].items.length - 1);
const noManualMatch = await post("/api/itinerary/edit", {
  snapshot: manualSnapshot,
  input: "SIMULAR_FALHA",
});
assert.equal(noManualMatch.changed, false);
assert.deepEqual(noManualMatch.itinerary, manualSnapshot.itinerary);
await post(
  "/api/itinerary/edit",
  { snapshot: manualSnapshot, input: "remover atividade 1 do dia 1" },
  403,
  { Origin: "https://untrusted.example" },
);

for (const language of ["pt", "en"]) {
  const snapshot = fixture();
  const tripId = `agent-api-${language}-${Date.now()}`;
  const versions = async () => (await fetch(`${base}/api/versions?tripId=${tripId}`)).json();
  await post("/api/versions", { tripId, snapshot, baseVersion: null, reason: "generated" });
  const request = { tripId, snapshot, baseVersion: 1, input: "Pedido sintético", language };
  await post("/api/assistant/plan", { ...request, input: "SIMULAR_FALHA" }, 503);
  await post("/api/assistant/plan", { ...request, input: "SIMULAR_INVALIDO" }, 422);
  assert.equal((await versions()).length, 1);
  await post("/api/assistant/plan", request, 403, { Origin: "https://untrusted.example" });
  await post("/api/assistant/plan", { ...request, input: "" }, 400);
  await post("/api/assistant/plan", { ...request, language: "fr" }, 400);

  const informational = await post("/api/assistant/plan", {
    ...request,
    input: "SIMULAR_ESCLARECIMENTO",
  });
  assert.deepEqual(informational.plan.actions, []);
  assert.equal((await versions()).length, 1);
  await post(
    "/api/assistant/plan",
    { tripId, baseVersion: 1, runId: informational.runId, decision: "accept", language },
    409,
  );

  const rejected = await post("/api/assistant/plan", request);
  assert.equal((await versions()).length, 1);
  assert.deepEqual(rejected.before, snapshot.itinerary);
  assert.equal(rejected.plan.summary, language === "en" ? "Proposed change" : "Alteração proposta");
  await post("/api/assistant/plan", {
    tripId,
    baseVersion: 1,
    runId: rejected.runId,
    decision: "reject",
    language,
  });
  assert.equal((await versions()).length, 1);

  const proposal = await post("/api/assistant/plan", request);
  const stale = await post("/api/assistant/plan", request);
  const accepted = await post("/api/assistant/plan", {
    tripId,
    baseVersion: 1,
    runId: proposal.runId,
    decision: "accept",
    language,
  });
  assert.equal(accepted.version, 2);
  assert.equal(accepted.snapshot.itinerary[0].items.length, snapshot.itinerary[0].items.length - 1);
  assert.equal((await versions()).length, 2);
  await post(
    "/api/assistant/plan",
    { tripId, baseVersion: 1, runId: proposal.runId, decision: "accept", language },
    409,
  );
  await post(
    "/api/assistant/plan",
    { tripId, baseVersion: 1, runId: stale.runId, decision: "accept", language },
    409,
  );
  await post("/api/assistant/plan", request, 409);
}
console.log(
  "HTTP com fornecedor local: PT/EN, esclarecimento, falhas, proposta, rejeição, aceitação, versão, origem e conflitos OK",
);
