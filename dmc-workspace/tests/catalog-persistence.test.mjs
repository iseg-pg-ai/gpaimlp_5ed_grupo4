import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { persistCatalog, syncPendingCatalog } from "../src/lib/catalog-persistence.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { CatalogStore } from "../src/lib/catalog-store.ts";

const input = () => ({
  category: "atracoes",
  status: "draft",
  baseRevision: null,
  reason: "Teste de persistência",
  fields: {
    ...emptyFields(),
    name: "Jardim",
    location: "Lisboa",
    description: "Visita ao jardim",
    duration: "60 min",
    price: "10 EUR por pessoa",
    accessibility: "Entrada sem degraus",
    source: "Fornecedor",
    effort: "Baixo",
  },
});

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-catalog-persistence-"));
  const catalog = path.join(root, "catalog");
  const operations = path.join(root, "operations");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { catalog, operations };
}

test("catálogo grava em SQL quando disponível", async (t) => {
  const { catalog, operations } = fixture(t);
  const result = await persistCatalog(input(), {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  assert.equal(result.queued, false);
  assert.equal(result.record.revision, 1);
  const events = readdirSync(path.join(operations, "data-s3-outbox"));
  assert.equal(events.length, 1);
  const event = JSON.parse(
    readFileSync(path.join(operations, "data-s3-outbox", events[0]), "utf8"),
  );
  assert.equal(event.operationType, "catalog.save");
  assert.equal(event.syncState, "pending");
});

test("catálogo usa JSON, sincroniza e não duplica uma operação já confirmada", async (t) => {
  const { catalog, operations } = fixture(t);
  writeFileSync(catalog, "indisponível");
  const queued = await persistCatalog(input(), {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  assert.equal(queued.queued, true);
  const pendingFile = path.join(operations, "pending-catalog", `${queued.operationId}.json`);
  const pending = JSON.parse(readFileSync(pendingFile, "utf8"));
  assert.equal(pending.schemaVersion, 2);
  assert.equal(pending.operationType, "catalog.save");
  assert.equal(pending.syncState, "pending");
  assert.equal(pending.entity, "new:atracoes");
  assert.equal(pending.baseVersion, null);

  unlinkSync(catalog);
  const store = new CatalogStore(catalog);
  await store.save(pending.input, pending.operationId);
  assert.equal(await syncPendingCatalog(store, operations), 1);
  assert.equal((await store.list()).length, 1);
  assert.equal(readdirSync(path.dirname(pendingFile)).length, 0);
});
