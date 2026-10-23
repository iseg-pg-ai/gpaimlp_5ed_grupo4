import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CatalogStore, CatalogConflict } from "../src/lib/catalog-store.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { emptyMatching } from "../src/lib/catalog-matching.ts";

const input = () => ({
  category: "atracoes",
  status: "draft",
  baseRevision: null,
  reason: "Teste",
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
test("catalog revisions survive reopen, reject stale edits and immediately revoke published records", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-catalog-"));
  let store = new CatalogStore(root);
  try {
    const matching = {
      ...emptyMatching(),
      interests: ["Culture & Heritage"],
      children: "allowed",
      maxGroup: 8,
    };
    const pricing = { amount: "12,50", currency: "EUR", unit: "person", status: "estimated" };
    const first = await store.save({
      ...input(),
      matching,
      pricing,
      subcategory: "Museu e galeria",
    });
    const approved = await store.save({
      ...input(),
      id: first.id,
      baseRevision: 1,
      status: "approved",
    });
    const warehouse = { _catalog_id: first.id, _catalog_revision: 2, _catalog_status: "approved" };
    assert.ok(await store.isPublished(warehouse));
    await assert.rejects(
      async () => await store.save({ ...input(), id: first.id, baseRevision: 1 }),
      CatalogConflict,
    );
    const inactive = await store.save({
      ...input(),
      id: first.id,
      baseRevision: 2,
      status: "inactive",
    });
    assert.equal(inactive.id, approved.id);
    assert.ok(!(await store.isPublished(warehouse)));
    assert.equal((await store.history(first.id)).length, 3);
    assert.equal((await store.history(first.id))[0].subcategory, "Museu e galeria");
    await assert.rejects(
      async () => await store.save({ ...input(), subcategory: "Peixe e marisco" }),
      /Subcategoria/,
    );
    assert.deepEqual((await store.history(first.id))[0].pricing, pricing);
    assert.deepEqual((await store.history(first.id))[2].pricing, pricing);
    assert.equal((await store.history(first.id))[2].status, "draft");
    assert.deepEqual((await store.history(first.id))[2].matching, matching);
    assert.deepEqual((await store.history(first.id))[0].matching, matching);

    store = new CatalogStore(root);
    assert.equal((await store.list())[0].revision, 3);
    await assert.rejects(
      async () =>
        await store.save({
          ...input(),
          fields: { ...emptyFields(), name: "Incomplete" },
          status: "approved",
        }),
    );
    await assert.rejects(
      async () =>
        await store.save({ ...input(), id: first.id, category: "experiencias", baseRevision: 3 }),
    );
    const legacy = {
      ...input(),
      fields: { ...input().fields, effort: "Moderado (estimativa; confirmar mobilidade)" },
    };
    assert.equal((await store.save({ ...legacy, status: "inactive" })).status, "inactive");
    await assert.rejects(async () => await store.save({ ...legacy, status: "approved" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("warehouse import is idempotent and does not overwrite edits or approve legacy rows", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-catalog-"));
  const store = new CatalogStore(root);
  const warehouse = path.resolve(process.env.BLU_WAREHOUSE_DIR ?? "../warehouse");
  try {
    await store.importWarehouse(warehouse);
    const initial = await store.list();
    assert.ok(initial.length > 0);
    assert.ok(initial.every((r) => r.status === "review"));
    const first = initial[0];
    await store.save({
      ...first,
      baseRevision: first.revision,
      fields: { ...first.fields, name: "Nome alterado" },
      reason: "Correção",
    });
    await store.importWarehouse(warehouse);
    assert.equal((await store.list()).length, initial.length);
    assert.equal((await store.history(first.id)).length, 2);
    assert.equal((await store.history(first.id))[0].fields.name, "Nome alterado");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
