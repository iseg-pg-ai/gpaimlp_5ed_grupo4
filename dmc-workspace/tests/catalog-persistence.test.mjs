import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { persistCatalog, syncPendingCatalog } from "../src/lib/catalog-persistence.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { CatalogConflict, CatalogStore } from "../src/lib/catalog-store.ts";

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

test("catálogo recupera falha entre commit SQL e outbox S3", async (t) => {
  const { catalog, operations } = fixture(t);
  mkdirSync(operations, { recursive: true });
  const blockedOutbox = path.join(operations, "data-s3-outbox");
  writeFileSync(blockedOutbox, "indisponível");
  const result = await persistCatalog(input(), {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  assert.equal(result.queued, true);
  const pending = path.join(operations, "pending-catalog", `${result.operationId}.json`);
  assert.ok(readFileSync(pending, "utf8"));

  unlinkSync(blockedOutbox);
  const restarted = new CatalogStore(catalog);
  assert.equal(await syncPendingCatalog(restarted, operations), 1);
  assert.equal((await restarted.list()).length, 1);
  assert.equal(readdirSync(path.join(operations, "data-s3-outbox")).length, 1);
  assert.equal(readdirSync(path.dirname(pending)).length, 0);
});

test("interrupção prolongada preserva ordem, reinício, repetição e conflitos", async (t) => {
  const { catalog, operations } = fixture(t);
  const store = new CatalogStore(catalog);
  const original = await store.save(input());
  const available = `${catalog}-available`;
  renameSync(catalog, available);
  writeFileSync(catalog, "indisponível");

  const revision2 = {
    ...input(),
    id: original.id,
    baseRevision: 1,
    fields: { ...input().fields, name: "Jardim revisto" },
  };
  const revision3 = {
    ...revision2,
    baseRevision: 2,
    fields: { ...revision2.fields, description: "Descrição confirmada" },
  };
  const first = await persistCatalog(revision2, {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  const second = await persistCatalog(revision3, {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  const repeated = await persistCatalog(revision3, {
    catalogRoot: catalog,
    operationalRoot: operations,
  });
  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.equal(repeated.queued, true);
  assert.equal(readdirSync(path.join(operations, "pending-catalog")).length, 2);

  unlinkSync(catalog);
  renameSync(available, catalog);
  const restarted = new CatalogStore(catalog);
  assert.equal(await syncPendingCatalog(restarted, operations), 2);
  assert.equal(await syncPendingCatalog(restarted, operations), 0);
  const current = (await restarted.list()).find((record) => record.id === original.id);
  assert.equal(current?.revision, 3);
  assert.equal(current?.fields.description, "Descrição confirmada");

  renameSync(catalog, available);
  writeFileSync(catalog, "indisponível");
  const conflict = await persistCatalog(
    { ...revision3, baseRevision: 3, fields: { ...revision3.fields, name: "Fila" } },
    { catalogRoot: catalog, operationalRoot: operations },
  );
  assert.equal(conflict.queued, true);
  unlinkSync(catalog);
  renameSync(available, catalog);
  await restarted.save({
    ...revision3,
    baseRevision: 3,
    fields: { ...revision3.fields, name: "Edição concorrente" },
  });
  await assert.rejects(syncPendingCatalog(new CatalogStore(catalog), operations), CatalogConflict);
  assert.equal(readdirSync(path.join(operations, "pending-catalog")).length, 1);
});
