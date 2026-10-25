import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DraftConflict, DraftStore } from "../src/lib/draft-store.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
);
Object.assign(fixture.brief, {
  childrenAges: "8",
  specialOccasion: "",
  notes: "",
  accommodation: "",
  diningPace: "Relaxed Dining (~90m)",
});

function setup(t, clock = () => new Date("2026-10-25T12:00:00.000Z")) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-drafts-"));
  const store = new DraftStore(root, 90, clock);
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return store;
}

test("rascunhos são privados por utilizador e viagem", (t) => {
  const store = setup(t);
  const saved = store.save("user:a", "trip-one", fixture, null);
  assert.equal(saved.revision, 1);
  assert.equal(
    store.get("user:a", "trip-one").payload.brief.customerName,
    fixture.brief.customerName,
  );
  assert.equal(store.get("user:b", "trip-one"), null);
  assert.deepEqual(store.list("user:b"), []);
});

test("revisões obsoletas não substituem alterações de outro dispositivo", (t) => {
  const store = setup(t);
  store.save("user:a", "trip-one", fixture, null);
  const changed = structuredClone(fixture);
  changed.brief.destination = "Porto";
  assert.equal(store.save("user:a", "trip-one", changed, 1).revision, 2);
  assert.throws(() => store.save("user:a", "trip-one", fixture, 1), DraftConflict);
  assert.equal(store.get("user:a", "trip-one").payload.brief.destination, "Porto");
});

test("repetir o mesmo conteúdo não cria uma revisão artificial", (t) => {
  const store = setup(t);
  store.save("user:a", "trip-one", fixture, null);
  assert.equal(store.save("user:a", "trip-one", structuredClone(fixture), 1).revision, 1);
});

test("eliminação exige revisão atual e respeita preservação legal", (t) => {
  const store = setup(t);
  store.save("user:a", "trip-one", fixture, null);
  assert.throws(() => store.remove("user:a", "trip-one", 2), DraftConflict);
  store.db
    .prepare("UPDATE drafts SET legalHold=1 WHERE ownerId=? AND tripId=?")
    .run("user:a", "trip-one");
  assert.throws(() => store.remove("user:a", "trip-one", 1), DraftConflict);
  assert.ok(store.get("user:a", "trip-one"));
});

test("limpeza elimina apenas rascunhos expirados sem preservação", (t) => {
  let now = new Date("2026-01-01T00:00:00.000Z");
  const store = setup(t, () => now);
  store.save("user:a", "expired", fixture, null);
  store.save("user:a", "protected", fixture, null);
  store.db
    .prepare("UPDATE drafts SET legalHold=1 WHERE ownerId=? AND tripId=?")
    .run("user:a", "protected");
  now = new Date("2026-04-02T00:00:00.000Z");
  assert.equal(store.cleanupExpired(), 1);
  assert.equal(store.get("user:a", "expired"), null);
  assert.ok(store.get("user:a", "protected"));
});
