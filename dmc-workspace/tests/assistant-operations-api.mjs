// Integração real da API, sem Bedrock, em servidor e dados temporários explícitos.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VersionStore, snapshotFingerprint } from "../src/lib/version-store.ts";
import { CatalogStore } from "../src/lib/catalog-store.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { ratingFields } from "../src/lib/feedback-store.ts";
const root = process.env.BLU_ASSISTANT_TEST_ROOT;
const base = process.env.PORTAL_URL;
if (
  !root ||
  !path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) ||
  !base ||
  new URL(base).hostname !== "127.0.0.1" ||
  new URL(base).port !== "3002"
)
  throw new Error(
    "Exige BLU_ASSISTANT_TEST_ROOT em tmp e PORTAL_URL em 127.0.0.1:3002. Nunca executar sobre dados operacionais.",
  );
const token = "synthetic-operations-test-token-00000000";
const request = (body, options = {}) =>
  fetch(`${base}/api/assistant/operations`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3002",
      ...options.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...options,
  });
mkdirSync(path.join(root, "warehouse"), { recursive: true });
for (const table of ["atracoes", "restaurantes", "experiencias", "curation_rules"])
  writeFileSync(path.join(root, "warehouse", `${table}.jsonl`), "");
const initial = await request();
assert.equal(initial.status, 200);
const initialData = await initial.json();
assert.equal(
  initialData.versions.length,
  0,
  "O servidor não está isolado: existem versões anteriores.",
);
assert.equal(
  initialData.records.length,
  0,
  "O servidor não está isolado: existem registos de catálogo anteriores.",
);
const catalog = new CatalogStore(path.join(root, "data/portal"));
const record = await catalog.save({
  category: "atracoes",
  status: "approved",
  baseRevision: null,
  reason: "Teste isolado",
  fields: {
    ...emptyFields(),
    name: "Museu sintético",
    location: "Lisboa",
    description: "Descrição sintética",
    duration: "60 min",
    price: "10 EUR por grupo",
    accessibility: "Sem degraus",
    source: "Fonte sintética",
    effort: "Baixo",
  },
});
const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
Object.assign(snapshot.brief, {
  childrenAges: "7",
  specialOccasion: "",
  notes: "NOTA_INTERNA",
  accommodation: "Boutique",
  diningPace: "Relaxed Dining (~90m)",
});
snapshot.itinerary = snapshot.itinerary.slice(0, 1);
snapshot.itinerary[0].items = [
  {
    id: `atracoes:${record.id}`,
    catalogRevision: 1,
    title: "Museu sintético",
    time: "10:00–11:00 (proposto)",
    category: "activity",
    duration: "60 min",
  },
];
const store = new VersionStore(path.join(root, "exports"));
try {
  store.save("synthetic-api-trip", snapshot, "generated", null);
  const before = snapshotFingerprint(snapshot);
  assert.equal((await fetch(`${base}/api/assistant/operations`)).status, 401);
  assert.equal(
    (
      await request(
        { action: "complete", tripId: "synthetic-api-trip", version: 1, confirm: true },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Origin: "https://invalid.example",
          },
        },
      )
    ).status,
    403,
  );
  const post = (extra) =>
    request({ tripId: "synthetic-api-trip", version: 1, confirm: true, ...extra });
  assert.equal((await post({ action: "complete", confirm: false })).status, 400);
  assert.equal((await post({ action: "complete" })).status, 200);
  assert.equal(
    (await post({ action: "feedback", feedback: { notes: "", items: [] } })).status,
    400,
  );
  const items = [
    {
      dayNumber: 1,
      itemId: snapshot.itinerary[0].items[0].id,
      outcome: "completed",
      ratings: Object.fromEntries(ratingFields.map((field) => [field, 5])),
      comment: "Experiência sintética",
      issues: [],
    },
  ];
  assert.equal((await post({ action: "feedback", feedback: { notes: "", items } })).status, 200);
  assert.equal((await post({ action: "feedback", feedback: { notes: "", items } })).status, 409);
  assert.equal((await post({ action: "approve-case" })).status, 200);
  const report = await (await request()).json();
  assert.equal(report.cases.length, 1);
  assert.equal(report.responses[0].catalogRevision, 1);
  assert.doesNotMatch(JSON.stringify(report.cases), /NOTA_INTERNA/);
  const communication = await (await post({ action: "communication", locale: "pt" })).json();
  assert.equal(communication.sent, false);
  assert.doesNotMatch(communication.draft, /NOTA_INTERNA/);
  assert.equal(
    (
      await post({
        action: "catalog-decision",
        catalogId: record.id,
        baseRevision: 1,
        decision: "inactive",
        reason: "Revisão humana sintética",
      })
    ).status,
    200,
  );
  assert.equal((await catalog.list())[0].status, "inactive");
  assert.equal(
    (
      await post({
        action: "catalog-decision",
        catalogId: record.id,
        baseRevision: 1,
        decision: "review",
        reason: "Revisão obsoleta",
      })
    ).status,
    409,
  );
  assert.equal((await (await request()).json()).responses.length, 1);
  assert.equal(
    snapshotFingerprint(JSON.parse(store.get("synthetic-api-trip", 1).snapshot)),
    before,
  );
  assert.equal(store.list("synthetic-api-trip").length, 1);
  console.log("API autenticada → conclusão → feedback → caso → inativação: OK (sem inferência)");
} finally {
  store.close();
}
