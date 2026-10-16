import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VersionStore, snapshotFingerprint } from "../src/lib/version-store.ts";
import { FeedbackStore, ratingFields } from "../src/lib/feedback-store.ts";
import { HistoricalCases } from "../src/lib/historical-cases.ts";
import { generateItinerary } from "../src/lib/curation.ts";
import { simulatePlan, resolveRanking, plannerContext } from "../src/lib/assistant-actions.ts";
import { proposalDiagnostics } from "../src/lib/proposal-diagnostics.ts";
import { authorizeOperations } from "../src/lib/operations-auth.ts";
import { prepareCommunication } from "../src/lib/assistant-communication.ts";
import { initialConfirmation } from "../src/lib/activity-confirmation.ts";
import { AgentAuditStore } from "../src/lib/agent-audit-store.ts";

function setup() {
  const fixture = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  const brief = {
    ...fixture.brief,
    customerName: "NOME_PRIVADO",
    customerEmail: "segredo@example.com",
    notes: "NOTA_PRIVADA",
    childrenAges: "",
    specialOccasion: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
    destination: "Lisboa",
    startDate: "2026-10-05",
    endDate: "2026-10-06",
    children: 0,
    mobilityRestrictions: [],
    dietaryRestrictions: [],
    exclusions: [],
    budget: 1000,
    pace: "Balanced",
  };
  const row = (id, longitude) => ({
    id,
    _catalog_status: "approved",
    _catalog_revision: 6,
    _source_row: 1,
    cidade: "Lisboa",
    nome_da_atracao: id,
    esforco_fisico: "Baixo",
    horario: "Todos os dias 09:00–18:00",
    tempo_medio_de_visita: "60 min",
    latitude: 38.72,
    longitude,
  });
  const catalog = {
    atracoes: [row("A", -9.1), row("B", -9.2), row("C", -9.3)],
    restaurantes: [],
    experiencias: [],
    curation_rules: [
      "R01",
      "R03",
      "R04",
      "R05",
      "R09",
      "R15",
      "R16",
      "R33",
      "R40",
      "R41",
      "R43",
    ].map((id) => ({ id })),
  };
  const snapshot = {
    brief,
    pending: [],
    itinerary: generateItinerary(brief, { ...catalog, atracoes: [catalog.atracoes[0]] }).itinerary,
  };
  snapshot.itinerary.forEach((day) => {
    day.dailyCapacity = 3;
    day.items = day.dayNumber === 1 ? day.items.slice(0, 1) : [];
  });
  return { snapshot, catalog };
}
const plan = (actions) => ({
  summary: "Proposta para revisão",
  actions,
  warnings: [],
  requiresConfirmation: true,
});
test("mover entre dias preserva dados, invalida confirmações pendentes e recusa destinos incompatíveis atomicamente", () => {
  const { snapshot, catalog } = setup();
  const item = snapshot.itinerary[0].items[0];
  item.confirmation = {
    ...initialConfirmation(item),
    reference: "REFERENCIA_FORNECIDA",
    checks: initialConfirmation(item).checks.map((check) => ({
      ...check,
      resolved: true,
      details: "Informação fornecida",
    })),
  };
  const original = snapshotFingerprint(snapshot);
  const actions = [{ type: "move_item", dayNumber: 1, itemId: item.id, targetDayNumber: 2 }];
  const result = simulatePlan(snapshot, plan(actions), catalog);
  assert.equal(result.itinerary[0].items.length, 0);
  assert.equal(result.itinerary[1].items[0].id, item.id);
  assert.equal(result.itinerary[1].items[0].source, item.source);
  assert.equal(result.itinerary[1].items[0].catalogRevision, 6);
  assert.equal(result.itinerary[1].items[0].confirmation.reference, "REFERENCIA_FORNECIDA");
  assert.equal(result.itinerary[1].items[0].confirmation.status, "pending");
  assert.equal(result.itinerary[1].items[0].confirmation.checks[0].resolved, false);
  assert.equal(snapshotFingerprint(snapshot), original);
  snapshot.itinerary[1].location = "Porto";
  assert.throws(() => simulatePlan(snapshot, plan(actions), catalog));
  snapshot.itinerary[1].location = "Lisboa";
  item.isLocked = true;
  assert.throws(() => simulatePlan(snapshot, plan(actions), catalog));
});
test("novas ações não contornam atividades protegidas nem inventam confirmação de reserva", () => {
  const { snapshot, catalog } = setup();
  const item = snapshot.itinerary[0].items[0];
  const patch = plan([
    {
      type: "update_pending_confirmation",
      dayNumber: 1,
      itemId: item.id,
      confirmationPatch: {
        reference: "PEDIDO-123",
        notes: "Informação fornecida pelo trabalhador",
      },
    },
  ]);
  const result = simulatePlan(snapshot, patch, catalog);
  assert.equal(result.itinerary[0].items[0].confirmation.status, "pending");
  assert.equal(result.itinerary[0].items[0].confirmation.reference, "PEDIDO-123");
  patch.actions[0].confirmationPatch.status = "confirmed";
  assert.throws(() => simulatePlan(snapshot, patch, catalog));
  item.isLocked = true;
  assert.throws(() =>
    simulatePlan(
      snapshot,
      plan([
        { type: "regenerate_day", dayNumber: 1 },
        { type: "remove_item", dayNumber: 1, itemId: item.id },
      ]),
      catalog,
    ),
  );
});
test("ranking é elegível, sem escrita, e alterações ao briefing passam pelas regras existentes", () => {
  const { snapshot, catalog } = setup();
  const before = snapshotFingerprint(snapshot);
  const ranking = {
    ...plan([]),
    ranking: [{ dayNumber: 2, catalogIds: ["atracoes:B", "atracoes:C"] }],
  };
  assert.equal(resolveRanking(snapshot, ranking, catalog)[0].options[0].title, "B");
  assert.equal(snapshotFingerprint(simulatePlan(snapshot, ranking, catalog)), before);
  ranking.ranking[0].catalogIds.push("atracoes:inexistente");
  assert.throws(() => resolveRanking(snapshot, ranking, catalog));
  const updated = simulatePlan(
    snapshot,
    plan([{ type: "update_brief", dayNumber: 1, briefPatch: { budget: 1200 } }]),
    catalog,
  );
  assert.equal(updated.brief.budget, 1200);
  assert.deepEqual(updated.itinerary, snapshot.itinerary);
  assert.throws(() =>
    simulatePlan(
      snapshot,
      plan([
        { type: "update_brief", dayNumber: 1, briefPatch: { customerEmail: "novo@example.com" } },
      ]),
      catalog,
    ),
  );
  assert.equal(plannerContext(snapshot, catalog).candidates[0].catalogRevision, 6);
});
test("feedback completo é imutável, mantém revisão e só casos aprovados e bem avaliados são recuperados", () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-feedback-"));
  const store = new VersionStore(root);
  try {
    const { snapshot } = setup();
    store.save("trip", snapshot, "generated", null);
    const original = snapshotFingerprint(snapshot);
    const feedback = new FeedbackStore(store),
      cases = new HistoricalCases(feedback);
    feedback.complete("trip", 1, "Operador de teste");
    assert.throws(() => feedback.submit("trip", 1, { operator: "Teste", notes: "", items: [] }));
    assert.equal(feedback.list()[0].status, "pending");
    assert.equal(feedback.items("trip", 1).length, 0);
    const items = snapshot.itinerary.flatMap((day) =>
      day.items.map((item) => ({
        dayNumber: day.dayNumber,
        itemId: item.id,
        outcome: "completed",
        ratings: Object.fromEntries(ratingFields.map((field) => [field, 5])),
        issues: [],
        comment: "Boa experiência",
      })),
    );
    feedback.submit("trip", 1, { operator: "Teste", notes: "NOTA_PRIVADA", items });
    assert.equal(feedback.items("trip", 1)[0].catalogRevision, 6);
    assert.throws(() => feedback.submit("trip", 1, { operator: "Teste", notes: "", items }));
    assert.equal(cases.search(snapshot).length, 0);
    cases.approve("trip", 1, "Revisor");
    const found = cases.search(snapshot);
    assert.equal(found.length, 1);
    assert.doesNotMatch(JSON.stringify(found), /NOME_PRIVADO|NOTA_PRIVADA|segredo@example/);
    assert.equal(snapshotFingerprint(JSON.parse(store.get("trip", 1).snapshot)), original);
    store.trashVersion("trip", 1);
    assert.equal(cases.search(snapshot).length, 0);
    store.restoreVersion("trip", 1);
    assert.equal(cases.search(snapshot).length, 1);
    assert.equal(feedback.quality()[0].average, 5);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("operação exige autenticação inclusive para leitura, sem aceitar identidade do navegador", () => {
  const oldToken = process.env.BLU_OPERATIONS_TOKEN,
    oldId = process.env.BLU_OPERATOR_ID;
  try {
    delete process.env.BLU_OPERATIONS_TOKEN;
    delete process.env.BLU_OPERATOR_ID;
    assert.equal(authorizeOperations(new Request("http://localhost")).status, 503);
    process.env.BLU_OPERATIONS_TOKEN = "x".repeat(40);
    process.env.BLU_OPERATOR_ID = "Operador autenticado";
    assert.equal(authorizeOperations(new Request("http://localhost")).status, 401);
    assert.equal(
      authorizeOperations(
        new Request("http://localhost", { headers: { Authorization: `Bearer ${"y".repeat(40)}` } }),
      ).status,
      401,
    );
    assert.deepEqual(
      authorizeOperations(
        new Request("http://localhost", { headers: { Authorization: `Bearer ${"x".repeat(40)}` } }),
      ),
      { operator: "Operador autenticado" },
    );
  } finally {
    if (oldToken === undefined) delete process.env.BLU_OPERATIONS_TOKEN;
    else process.env.BLU_OPERATIONS_TOKEN = oldToken;
    if (oldId === undefined) delete process.env.BLU_OPERATOR_ID;
    else process.env.BLU_OPERATOR_ID = oldId;
  }
});
test("diagnóstico distingue chuva histórica e não converte moedas nem desconhecidos em compatibilidade", () => {
  const { snapshot, catalog } = setup();
  snapshot.itinerary[0].dailyCapacity = 0;
  const weather = {
    1: {
      status: "available",
      weather: {
        isRainy: true,
        isHistorical: true,
        sourceUrl: "https://archive-api.open-meteo.com",
      },
    },
  };
  const alerts = proposalDiagnostics(snapshot, catalog, weather);
  assert.ok(alerts.some((alert) => alert.code === "CAPACITY"));
  assert.ok(alerts.some((alert) => alert.code === "PRICE_UNKNOWN"));
  assert.ok(alerts.some((alert) => alert.code === "HISTORICAL_RAIN"));
  assert.ok(!alerts.some((alert) => alert.code === "RAIN"));
});
test("rascunhos para clientes e fornecedores não enviam mensagens nem incluem dados internos", async () => {
  const { snapshot } = setup();
  for (const kind of ["client", "supplier"]) {
    const result = await prepareCommunication(snapshot, "pt", kind);
    assert.equal(result.sent, false);
    assert.equal(result.requiresReview, true);
    assert.doesNotMatch(result.draft, /NOME_PRIVADO|NOTA_PRIVADA|segredo@example/);
  }
});
test("regeneração mantém a atividade protegida e otimização usa horários validados", () => {
  const { snapshot, catalog } = setup();
  const protectedActivity = structuredClone(snapshot.itinerary[0].items[0]);
  protectedActivity.isLocked = true;
  snapshot.itinerary[0].items[0] = protectedActivity;
  const regenerated = simulatePlan(
    snapshot,
    plan([{ type: "regenerate_day", dayNumber: 1 }]),
    catalog,
  );
  assert.deepEqual(
    regenerated.itinerary[0].items.find((item) => item.id === protectedActivity.id),
    protectedActivity,
  );
  assert.ok(regenerated.itinerary[0].items.length > 1);
  assert.deepEqual(regenerated.itinerary[1], snapshot.itinerary[1]);
  const full = generateItinerary(
    { ...snapshot.brief, endDate: snapshot.brief.startDate, pace: "Active" },
    catalog,
  ).itinerary[0].items;
  const byId = (id) => full.find((item) => item.id === `atracoes:${id}`);
  snapshot.itinerary[0].items = ["A", "C", "B"].map(byId);
  const optimized = simulatePlan(
    snapshot,
    plan([{ type: "optimize_route", dayNumber: 1 }]),
    catalog,
  );
  assert.deepEqual(
    optimized.itinerary[0].items.map((item) => item.id),
    ["atracoes:A", "atracoes:B", "atracoes:C"],
  );
  assert.ok(optimized.itinerary[0].items.every((item) => item.time.includes("(proposto)")));
  assert.ok(!optimized.itinerary[0].routeSummary);
});
test("métricas guardam motivos e só calculam custo com tarifas explicitamente configuradas", () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-metrics-"));
  const store = new VersionStore(root),
    old = process.env.BLU_BEDROCK_RATES_JSON;
  try {
    const { snapshot, catalog } = setup();
    store.save("trip", snapshot, "generated", null);
    const audit = new AgentAuditStore(store);
    const p = plan([
      { type: "remove_item", dayNumber: 1, itemId: snapshot.itinerary[0].items[0].id },
    ]);
    const id = audit.propose("trip", 1, "Pedido sintético", p, simulatePlan(snapshot, p, catalog), {
      modelId: "synthetic-model",
      inputTokens: 1000,
      outputTokens: 200,
      latencyMs: 500,
    });
    audit.decide(id, "trip", "reject", catalog, "Preferência por outra opção");
    delete process.env.BLU_BEDROCK_RATES_JSON;
    const metrics = audit.metrics();
    assert.equal(metrics.rejected, 1);
    assert.equal(metrics.models[0].costUsd, null);
    assert.equal(metrics.decisions[0].reason, "Preferência por outra opção");
    process.env.BLU_BEDROCK_RATES_JSON = JSON.stringify({
      "synthetic-model": { input: 1, output: 2 },
    });
    assert.equal(audit.metrics().models[0].costUsd, 0.0014);
  } finally {
    if (old === undefined) delete process.env.BLU_BEDROCK_RATES_JSON;
    else process.env.BLU_BEDROCK_RATES_JSON = old;
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
