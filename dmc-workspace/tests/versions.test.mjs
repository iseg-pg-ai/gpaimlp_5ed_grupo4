import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
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

test("price and budget changes create versions while later exports use the original captured catalogue", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "blu-frozen-"));
  const rendered = [];
  const store = new VersionStore(directory, async (content, meta, locale) => {
    rendered.push(structuredClone(content));
    return Buffer.from(JSON.stringify({ content, version: meta.version, locale }));
  });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const source = {
    location: "Rua original",
    price: "20 EUR",
    supplier: "Original",
    contact: "",
    hours: "09:00–18:00",
    accessibility: "",
    dietary: "",
    verification: "",
  };
  const proposal = structuredClone(snapshot);
  proposal.itinerary[0].items[0].catalogDetails = source;
  const first = store.save("frozen", proposal, "generated", null);
  const pdf = await store.pdf("frozen", 1);
  const pt = await store.localizedPdf("frozen", 1, "pt");
  source.price = "999 EUR";
  source.location = "Nova morada";
  proposal.itinerary[0].items[0].priceNote = "999 EUR";
  const second = store.save("frozen", proposal, "edited", 1);
  proposal.brief.budget = 5000;
  const third = store.save("frozen", proposal, "edited", 2);
  assert.equal(second.version, 2);
  assert.equal(third.version, 3);
  assert.notEqual(first.snapshotHash, second.snapshotHash);
  assert.notEqual(second.snapshotHash, third.snapshotHash);
  await store.localizedPdf("frozen", 1, "en");
  assert.equal(rendered.at(-1).itinerary[0].items[0].catalogDetails.price, "20 EUR");
  assert.equal(rendered.at(-1).brief.budget, 2000);
  assert.deepEqual((await store.pdf("frozen", 1)).bytes, pdf.bytes);
  assert.deepEqual((await store.localizedPdf("frozen", 1, "pt")).bytes, pt.bytes);
  assert.deepEqual(store.list("frozen").find((v) => v.version === 1).exportedLocales, ["en", "pt"]);
  assert.equal(store.get("frozen", 1).chainHash, first.chainHash);
});
