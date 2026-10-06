import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { VersionStore, VersionConflict } from "../src/lib/version-store.ts";
const snapshot = {
  brief: {
    customerName: "João & Inês",
    destination: "Lisboa / Sintra",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    adults: 2,
    children: 1,
    budget: 2000,
    currency: "EUR",
    proposalTier: "Soft",
    arrivalLocation: "LIS",
    departureLocation: "LIS",
    pace: "Relaxed",
    physicalEffort: "Baixo (Low)",
    morningPreference: "Late Start (10:30+)",
    interests: ["Culture & Heritage"],
    mobilityRestrictions: [],
    dietaryRestrictions: [],
    exclusions: [],
  },
  itinerary: [
    {
      dayNumber: 1,
      date: "2026-10-10",
      title: "Belém e património",
      location: "Lisboa",
      summary: "Proposta preliminar",
      items: [
        {
          id: "a",
          time: "Por agendar",
          title: "Mosteiro dos Jerónimos",
          description: "Visita sujeita a confirmação.",
          category: "activity",
          source: "ATRACOES, linha 10",
          priceNote: "Referência: €10; confirmar",
          pendingChecks: ["Disponibilidade"],
        },
      ],
    },
  ],
  pending: ["Disponibilidade e preços por confirmar."],
};
function setup(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "blu-versions-"));
  const store = new VersionStore(directory);
  t.after(() => {
    store.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  return { store, directory };
}
test("version chain is durable, monotonic, immutable and deduplicated", (t) => {
  const { store, directory } = setup(t);
  const first = store.save("trip-test", snapshot, "generated", null);
  assert.equal(first.version, 1);
  assert.equal(first.parentVersion, null);
  assert.match(first.filename, /^BLU_Joao-Ines_Lisboa-Sintra_2026-10-10_a_2026-10-11_v001\.pdf$/);
  assert.equal(store.save("trip-test", structuredClone(snapshot), "export", 1).version, 1);
  const next = structuredClone(snapshot);
  next.itinerary[0].items[0].title = "Alteração";
  const second = store.save("trip-test", next, "edited", 1);
  assert.equal(second.version, 2);
  assert.equal(second.parentVersion, 1);
  assert.equal(
    second.chainHash,
    createHash("sha256")
      .update(`${first.chainHash}|${second.snapshotHash}|trip-test|2|${second.createdAt}`)
      .digest("hex"),
  );
  assert.equal(
    JSON.parse(store.get("trip-test", 1).snapshot).itinerary[0].items[0].title,
    "Mosteiro dos Jerónimos",
  );
  const reopened = new VersionStore(directory);
  assert.equal(reopened.list("trip-test").length, 2);
  reopened.close();
});
test("stale writers cannot overwrite a newer revision", (t) => {
  const { store } = setup(t);
  store.save("trip-test", snapshot, "generated", null);
  const changed = structuredClone(snapshot);
  changed.brief.budget = 3000;
  store.save("trip-test", changed, "edited", 1);
  assert.throws(() => store.save("trip-test", snapshot, "edited", 1), VersionConflict);
  assert.equal(store.list("trip-test").length, 2);
  assert.throws(() => store.list("../escape"));
});
test("repeated and concurrent PDF exports return identical persisted bytes", async (t) => {
  const { store, directory } = setup(t);
  store.save("trip-test", snapshot, "generated", null);
  const [a, b] = await Promise.all([store.pdf("trip-test", 1), store.pdf("trip-test", 1)]);
  assert.equal(a.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(a.bytes, b.bytes);
  assert.deepEqual(a.bytes, readFileSync(path.join(directory, "trip-test", a.filename)));
  assert.deepEqual(a.bytes, (await store.pdf("trip-test", 1)).bytes);
  const sidecar = JSON.parse(
    readFileSync(path.join(directory, "trip-test", a.filename.replace(/\.pdf$/, ".json")), "utf8"),
  );
  assert.equal(sidecar.snapshot.brief.customerName, "João & Inês");
});
test("long content is paginated into a valid PDF", async (t) => {
  const { store } = setup(t);
  const long = structuredClone(snapshot);
  long.itinerary[0].items = Array.from({ length: 40 }, (_, i) => ({
    ...snapshot.itinerary[0].items[0],
    id: String(i),
    description: "Descrição longa de uma experiência cultural. ".repeat(30),
  }));
  store.save("trip-long", long, "generated", null);
  const result = await store.pdf("trip-long", 1);
  assert.ok(result.bytes.length > 15000);
  assert.match(result.bytes.toString("latin1"), /%%EOF/);
});

test("legacy filenames are simplified without changing archived PDF bytes", async (t) => {
  const { store } = setup(t);
  const first = store.save("trip-test", snapshot, "generated", null);
  const original = await store.pdf("trip-test", 1);
  const legacy = first.filename.replace(/\.pdf$/, "_trip-test.pdf");
  store.db.prepare("UPDATE versions SET filename=? WHERE tripId=?").run(legacy, "trip-test");
  assert.equal(store.list("trip-test")[0].filename, first.filename);
  assert.equal(store.get("trip-test", 1).filename, first.filename);
  const download = await store.pdf("trip-test", 1);
  assert.equal(download.filename, first.filename);
  assert.deepEqual(download.bytes, original.bytes);
});

test("localized variants share a snapshot, retain bytes and isolate languages", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "blu-languages-"));
  let calls = 0;
  const store = new VersionStore(directory, async (content, meta, locale) => {
    calls++;
    assert.equal(content.brief.customerName, snapshot.brief.customerName);
    return Buffer.from(`%PDF-test-${locale}-${meta.version}`);
  });
  t.after(() => {
    store.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const original = store.save("languages-test", snapshot, "generated", null);
  const pt = await store.localizedPdf("languages-test", 1, "pt");
  const zh = await store.localizedPdf("languages-test", 1, "zh");
  assert.match(pt.filename, /_v001_PT\.pdf$/);
  assert.match(zh.filename, /_v001_ZH\.pdf$/);
  assert.notDeepEqual(pt.bytes, zh.bytes);
  assert.deepEqual((await store.localizedPdf("languages-test", 1, "pt")).bytes, pt.bytes);
  assert.equal(calls, 2);
  assert.equal(store.list("languages-test").length, 1);
  assert.equal(store.get("languages-test", 1).chainHash, original.chainHash);
  assert.ok(store.get("languages-test", 1).exportedAt);
  assert.deepEqual(readFileSync(path.join(directory, "languages-test", zh.filename)), zh.bytes);
});

test("proposal shares retain their selected version, language, method and recipient", (t) => {
  const { store } = setup(t);
  store.save("trip-share", structuredClone(snapshot), "generated", null);
  const share = store.createShare("trip-share", 1, "fr", "link", "client@example.com");
  assert.match(share.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(share.version, 1);
  assert.equal(share.locale, "fr");
  assert.equal(share.method, "link");
  assert.equal(share.recipient, "client@example.com");
  assert.equal(share.customerName, snapshot.brief.customerName);

  const changed = structuredClone(snapshot);
  changed.brief.customerName = "Outro cliente";
  store.save("trip-share", changed, "edited", 1);
  const reopened = store.getShare(share.token);
  assert.equal(reopened.version, 1);
  assert.equal(reopened.customerName, snapshot.brief.customerName);
  assert.throws(() => store.getShare("invalid"), /Partilha inválida/);
});

test("trashed versions leave active history and restore with snapshots and PDFs intact", async (t) => {
  const { store } = setup(t);
  store.save("trip-trash", structuredClone(snapshot), "generated", null);
  const pdf = await store.pdf("trip-trash", 1);
  const removed = store.trashVersion("trip-trash", 1);
  assert.equal(removed.trashReason, "manual");
  assert.ok(removed.trashedAt);
  assert.equal(store.list("trip-trash").length, 0);
  assert.equal(store.listTrash().length, 1);
  assert.deepEqual((await store.pdf("trip-trash", 1)).bytes, pdf.bytes);
  assert.equal(JSON.parse(store.get("trip-trash", 1).snapshot).brief.customerName, "João & Inês");

  const restored = store.restoreVersion("trip-trash", 1);
  assert.equal(restored.trashedAt, null);
  assert.equal(store.listTrash().length, 0);
  assert.equal(store.list("trip-trash")[0].version, 1);
});

test("cleanup permanently removes only expired trash and preserves conserved versions", async (t) => {
  const { store, directory } = setup(t);
  const expired = structuredClone(snapshot);
  expired.brief.startDate = "2026-09-01";
  expired.brief.endDate = "2026-09-02";
  store.save("mixed-trip", expired, "generated", null);
  const oldPdf = await store.pdf("mixed-trip", 1);
  store.trashVersion("mixed-trip", 1);

  const future = structuredClone(snapshot);
  future.brief.startDate = "2026-11-01";
  future.brief.endDate = "2026-11-02";
  store.save("mixed-trip", future, "edited", 1);
  const futurePdf = await store.pdf("mixed-trip", 2);
  const result = store.cleanupExpiredTrash([], "2026-10-05");
  assert.deepEqual(result.deletedVersions, [{ tripId: "mixed-trip", version: 1 }]);
  assert.throws(() => store.get("mixed-trip", 1), /não encontrada/);
  assert.equal(store.get("mixed-trip", 2).version, 2);
  assert.ok(readFileSync(path.join(directory, "mixed-trip", futurePdf.filename)).length);
  assert.throws(() => readFileSync(path.join(directory, "mixed-trip", oldPdf.filename)));
});

test("cleanup retains the final version until the user confirms permanent deletion", async (t) => {
  const { store, directory } = setup(t);
  const expired = structuredClone(snapshot);
  expired.brief.startDate = "2026-09-01";
  expired.brief.endDate = "2026-09-02";
  store.save("expired-trip", expired, "generated", null);
  await store.pdf("expired-trip", 1);
  const revised = structuredClone(expired);
  revised.brief.notes = "Versão final";
  store.save("expired-trip", revised, "revised", 1);
  const finalPdf = await store.pdf("expired-trip", 2);

  const automatic = store.cleanupExpiredTrash(["expired-trip"], "2026-10-05");
  assert.deepEqual(automatic.deletedVersions, [{ tripId: "expired-trip", version: 1 }]);
  assert.deepEqual(automatic.deletedTripIds, []);
  assert.equal(store.get("expired-trip", 2).version, 2);
  assert.ok(readFileSync(path.join(directory, "expired-trip", finalPdf.filename)).length);

  const result = store.cleanupExpiredTrash(["expired-trip"], "2026-10-05", ["expired-trip"]);
  assert.deepEqual(result.deletedTripIds, ["expired-trip"]);
  assert.throws(() => store.get("expired-trip", 2), /não encontrada/);
  assert.equal(existsSync(path.join(directory, "expired-trip")), false);
});
