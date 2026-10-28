import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogStore } from "../src/lib/catalog-store.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const helper = fileURLToPath(new URL("./helpers/concurrent-writer.mjs", import.meta.url));
const fixtureSnapshot = fileURLToPath(new URL("./browser/fixture.json", import.meta.url));

function child(mode, root, input, label) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--experimental-strip-types", helper, mode, root, input, label],
      { encoding: "utf8", timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
      },
    );
  });
}

function temporary(t, prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("dois processos de catálogo não ultrapassam a mesma revisão-base", async (t) => {
  const root = temporary(t, "blu-catalog-processes-");
  const store = new CatalogStore(root);
  const original = await store.save({
    category: "atracoes",
    status: "draft",
    baseRevision: null,
    reason: "Base do ensaio multiprocesso",
    fields: {
      ...emptyFields(),
      name: "Base",
      location: "Lisboa",
      description: "Registo sintético",
      duration: "60 min",
      price: "Por confirmar",
      accessibility: "Por confirmar",
      source: "Teste sintético",
      effort: "Baixo",
    },
  });
  const input = path.join(root, "edit.json");
  writeFileSync(
    input,
    JSON.stringify({ ...original, baseRevision: 1, reason: "Edição concorrente" }),
  );

  const results = await Promise.all([
    child("catalog", root, input, "A"),
    child("catalog", root, input, "B"),
  ]);
  assert.deepEqual(results.map((result) => result.outcome).sort(), ["rejected", "saved"]);
  assert.equal((await store.history(original.id)).length, 2);
  assert.equal((await store.list()).find((record) => record.id === original.id).revision, 2);
});

test("dois processos de versões criam uma única sucessora da mesma base", async (t) => {
  const root = temporary(t, "blu-version-processes-");
  const snapshot = JSON.parse(readFileSync(fixtureSnapshot, "utf8"));
  const store = new VersionStore(root);
  store.save("multi-process", snapshot, "generated", null);
  store.close();
  const input = path.join(root, "snapshot.json");
  writeFileSync(input, JSON.stringify(snapshot));

  const results = await Promise.all([
    child("version", root, input, "A"),
    child("version", root, input, "B"),
  ]);
  assert.deepEqual(results.map((result) => result.outcome).sort(), ["rejected", "saved"]);
  const reopened = new VersionStore(root);
  assert.deepEqual(
    reopened.list("multi-process").map((record) => record.version),
    [2, 1],
  );
  reopened.close();
});
