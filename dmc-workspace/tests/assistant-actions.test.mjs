import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePlan, simulatePlan, plannerContext } from "../src/lib/assistant-actions.ts";
import { AgentAuditStore } from "../src/lib/agent-audit-store.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const fixture = () => {
  const s = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  Object.assign(s.brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "privado",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
    customerEmail: "privado@example.com",
  });
  for (const day of s.itinerary) {
    day.dailyCapacity = 6;
    for (const item of day.items) {
      item.isLocked = false;
      delete item.confirmation;
    }
  }
  return s;
};
const catalog = { atracoes: [], experiencias: [], restaurantes: [], curation_rules: [] };
const plan = (actions) => ({
  summary: "Rever proposta",
  actions,
  warnings: [],
  requiresConfirmation: true,
});

test("contrato partilhado rejeita ações inventadas, argumentos adicionais e ausência de confirmação", () => {
  const p = plan([{ type: "remove_item", dayNumber: 1, itemId: "test" }]);
  assert.doesNotThrow(() => validatePlan(p));
  for (const invalid of [
    { ...p, requiresConfirmation: false },
    plan([{ type: "delete_catalog", dayNumber: 1 }]),
    plan([{ type: "remove_item", dayNumber: 1 }]),
    plan([{ type: "remove_item", dayNumber: 1, itemId: "test", catalogId: "extra" }]),
    plan([{ type: "set_day_capacity", dayNumber: 1, capacity: 7 }]),
  ])
    assert.throws(() => validatePlan(invalid));
});

test("simulação composta é atómica, preserva a entrada e recusa itens protegidos ou inexistentes", () => {
  const s = fixture();
  const before = JSON.stringify(s);
  const id = s.itinerary[0].items.at(-1).id;
  const p = plan([
    { type: "remove_item", dayNumber: 1, itemId: id },
    { type: "set_day_capacity", dayNumber: 1, capacity: 5 },
  ]);
  const after = simulatePlan(s, p, catalog);
  assert.equal(after.itinerary[0].items.length, s.itinerary[0].items.length - 1);
  assert.equal(JSON.stringify(s), before);
  s.itinerary[0].items.at(-1).isLocked = true;
  assert.throws(() => simulatePlan(s, p, catalog), /protegida|confirmada/);
  assert.throws(() =>
    simulatePlan(s, plan([{ type: "remove_item", dayNumber: 1, itemId: "inventado" }]), catalog),
  );
  assert.throws(() =>
    simulatePlan(
      s,
      plan([{ type: "add_catalog_item", dayNumber: 1, catalogId: "atracoes:inventado" }]),
      catalog,
    ),
  );
});

test("contexto omite nomes, contactos, notas e referências de confirmação", () => {
  const s = fixture();
  s.brief.futureInternalField = "privado-futuro";
  s.itinerary[0].items[0].confirmation = {
    status: "pending",
    bookingReference: "SEGREDO",
    contact: "PRIVADO",
  };
  const context = JSON.stringify(plannerContext(s, catalog));
  assert.ok(!context.includes(s.brief.customerName));
  assert.ok(!context.includes("privado"));
  assert.ok(!context.includes("SEGREDO"));
});

test("aceitação guarda versão e auditoria juntas; rejeição, expiração e concorrência não alteram o roteiro", () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-agent-actions-"));
  const store = new VersionStore(root);
  try {
    const s = fixture();
    const base = store.save("agent-test", s, "generated", null);
    const audit = new AgentAuditStore(store);
    const p = plan([{ type: "remove_item", dayNumber: 1, itemId: s.itinerary[0].items.at(-1).id }]);
    const after = simulatePlan(s, p, catalog);
    const rejectId = audit.propose("agent-test", base.version, "não guardar texto", p, after, {});
    assert.equal(audit.decide(rejectId, "agent-test", "reject", catalog), null);
    assert.equal(store.list("agent-test").length, 1);
    const expiredId = audit.propose("agent-test", 1, "teste", p, after, {});
    store.db.prepare("UPDATE agent_runs SET createdAt='2000-01-01' WHERE id=?").run(expiredId);
    assert.throws(() => audit.decide(expiredId, "agent-test", "accept", catalog), /expirou/);
    const id = audit.propose("agent-test", 1, "teste", p, after, {});
    const changedRules = audit.propose("agent-test", 1, "teste", p, after, {});
    store.db.prepare("UPDATE agent_runs SET previewHash='different' WHERE id=?").run(changedRules);
    assert.throws(
      () => audit.decide(changedRules, "agent-test", "accept", catalog),
      /catálogo ou as regras mudaram/,
    );
    const stale = audit.propose("agent-test", 1, "teste", p, after, {});
    const result = audit.decide(id, "agent-test", "accept", catalog);
    assert.equal(result.version, 2);
    assert.equal(store.list("agent-test")[0].parentVersion, 1);
    assert.equal(
      store.db.prepare("SELECT status FROM agent_runs WHERE id=?").get(id).status,
      "accepted",
    );
    assert.throws(() => audit.decide(id, "agent-test", "accept", catalog), /decidida/);
    assert.throws(() => audit.decide(stale, "agent-test", "accept", catalog), /mudou/);
    assert.deepEqual(JSON.parse(store.get("agent-test", 1).snapshot), s);
    const count = store.list("agent-test").length;
    assert.throws(() =>
      store.save("agent-test", { ...after, pending: ["alterado"] }, "edited", 2, () => {
        throw new Error("falha de auditoria");
      }),
    );
    assert.equal(store.list("agent-test").length, count);
    store.db.prepare("DELETE FROM versions WHERE tripId=? AND version=1").run("agent-test");
    assert.equal(
      store.db.prepare("SELECT COUNT(*) AS total FROM agent_runs WHERE tripId=?").get("agent-test")
        .total,
      0,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
