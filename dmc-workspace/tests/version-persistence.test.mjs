import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  persistVersion,
  queuePendingVersion,
  syncPendingVersions,
} from "../src/lib/version-persistence.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const snapshot = {
  brief: {
    customerName: "Teste de persistência",
    destination: "Lisboa",
    startDate: "2026-11-01",
    endDate: "2026-11-02",
    adults: 2,
    children: 0,
    childrenAges: "",
    budget: 1000,
    currency: "EUR",
    proposalTier: "Soft",
    arrivalLocation: "LIS",
    departureLocation: "LIS",
    pace: "Relaxed",
    physicalEffort: "Baixo (Low)",
    morningPreference: "Late Start (10:30+)",
    diningPace: "Relaxed Dining (~90m)",
    specialOccasion: "",
    notes: "",
    accommodation: "",
    interests: ["Culture & Heritage"],
    mobilityRestrictions: [],
    dietaryRestrictions: [],
    exclusions: [],
  },
  itinerary: [
    {
      dayNumber: 1,
      date: "2026-11-01",
      title: "Lisboa",
      location: "Lisboa",
      items: [],
    },
  ],
  pending: [],
};

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-persistence-"));
  const versions = path.join(root, "versions");
  const operations = path.join(root, "operations");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, versions, operations };
}

test("grava diretamente em SQL quando a base está disponível", (t) => {
  const { versions, operations } = fixture(t);
  const result = persistVersion(
    { tripId: "sql-online", snapshot, reason: "generated", baseVersion: null },
    { versionRoot: versions, operationalRoot: operations },
  );
  assert.equal(result.queued, false);
  assert.equal(result.record.version, 1);
  const events = readdirSync(path.join(operations, "data-s3-outbox"));
  assert.equal(events.length, 1);
  const event = JSON.parse(
    readFileSync(path.join(operations, "data-s3-outbox", events[0]), "utf8"),
  );
  assert.equal(event.operationType, "version.save");
  assert.equal(event.syncState, "pending");
  const store = new VersionStore(versions);
  assert.equal(store.list("sql-online").length, 1);
  store.close();
});

test("protege em JSON quando SQL falha e sincroniza apenas depois da confirmação", (t) => {
  const { versions, operations } = fixture(t);
  writeFileSync(versions, "base temporariamente indisponível");
  const queued = persistVersion(
    { tripId: "sql-offline", snapshot, reason: "generated", baseVersion: null },
    { versionRoot: versions, operationalRoot: operations },
  );
  assert.equal(queued.queued, true);
  const pending = path.join(operations, "pending-versions", `${queued.operationId}.json`);
  const queuedOperation = JSON.parse(readFileSync(pending, "utf8"));
  assert.equal(queuedOperation.tripId, "sql-offline");
  assert.equal(queuedOperation.schemaVersion, 2);
  assert.equal(queuedOperation.operationType, "version.save");
  assert.equal(queuedOperation.entity, "sql-offline");
  assert.equal(queuedOperation.syncState, "pending");

  unlinkSync(versions);
  const store = new VersionStore(versions);
  const synchronized = syncPendingVersions(store, operations);
  assert.deepEqual(synchronized, { synchronized: 1, pending: 0 });
  assert.equal(store.list("sql-offline").length, 1);
  assert.equal(readdirSync(path.dirname(pending)).length, 0);
  store.close();
});

test("a repetição após commit SQL não duplica a versão e só então remove o JSON", (t) => {
  const { versions, operations } = fixture(t);
  writeFileSync(versions, "indisponível");
  const queued = persistVersion(
    { tripId: "idempotente", snapshot, reason: "generated", baseVersion: null },
    { versionRoot: versions, operationalRoot: operations },
  );
  assert.equal(queued.queued, true);
  const pendingFile = path.join(operations, "pending-versions", `${queued.operationId}.json`);
  const pending = JSON.parse(readFileSync(pendingFile, "utf8"));

  unlinkSync(versions);
  const store = new VersionStore(versions);
  store.save(
    pending.tripId,
    pending.snapshot,
    pending.reason,
    pending.baseVersion,
    undefined,
    pending.operationId,
  );
  queuePendingVersion(pending, operations);
  assert.equal(syncPendingVersions(store, operations).synchronized, 1);
  assert.equal(store.list("idempotente").length, 1);
  assert.equal(readdirSync(path.dirname(pendingFile)).length, 0);
  store.close();
});

test("falha entre commit SQL e outbox S3 é recuperada pelo write-ahead", (t) => {
  const { versions, operations } = fixture(t);
  mkdirSync(operations, { recursive: true });
  const blockedOutbox = path.join(operations, "data-s3-outbox");
  writeFileSync(blockedOutbox, "indisponível");
  const result = persistVersion(
    { tripId: "commit-sem-outbox", snapshot, reason: "generated", baseVersion: null },
    { versionRoot: versions, operationalRoot: operations },
  );
  assert.equal(result.queued, true);
  const pending = path.join(operations, "pending-versions", `${result.operationId}.json`);
  assert.ok(readFileSync(pending, "utf8"));
  const committed = new VersionStore(versions);
  assert.equal(committed.list("commit-sem-outbox").length, 1);
  unlinkSync(blockedOutbox);
  assert.equal(syncPendingVersions(committed, operations).synchronized, 1);
  assert.equal(committed.list("commit-sem-outbox").length, 1);
  assert.equal(readdirSync(path.join(operations, "data-s3-outbox")).length, 1);
  assert.equal(readdirSync(path.dirname(pending)).length, 0);
  committed.close();
});

test("várias versões sobrevivem à interrupção e sincronizam por dependência", (t) => {
  const { versions, operations } = fixture(t);
  writeFileSync(versions, "indisponível");
  const changed = {
    ...snapshot,
    itinerary: [{ ...snapshot.itinerary[0], title: "Lisboa revista" }],
  };
  const first = persistVersion(
    { tripId: "interrupcao", snapshot, reason: "generated", baseVersion: null },
    { versionRoot: versions, operationalRoot: operations },
  );
  const second = persistVersion(
    { tripId: "interrupcao", snapshot: changed, reason: "edited", baseVersion: 1 },
    { versionRoot: versions, operationalRoot: operations },
  );
  const repeated = persistVersion(
    { tripId: "interrupcao", snapshot: changed, reason: "edited", baseVersion: 1 },
    { versionRoot: versions, operationalRoot: operations },
  );
  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.equal(repeated.queued, true);
  assert.equal(readdirSync(path.join(operations, "pending-versions")).length, 2);

  unlinkSync(versions);
  const restarted = new VersionStore(versions);
  assert.deepEqual(syncPendingVersions(restarted, operations), { synchronized: 2, pending: 0 });
  assert.deepEqual(syncPendingVersions(restarted, operations), { synchronized: 0, pending: 0 });
  assert.equal(restarted.list("interrupcao").length, 2);
  assert.equal(
    JSON.parse(restarted.get("interrupcao", 2).snapshot).itinerary[0].title,
    "Lisboa revista",
  );
  restarted.close();
});
