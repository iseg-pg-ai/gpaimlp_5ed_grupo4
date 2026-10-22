import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
