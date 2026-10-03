import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { proposalBudget } from "../src/lib/proposal-budget.ts";
import { renderPdf } from "../src/lib/itinerary-pdf.ts";
import { VersionStore } from "../src/lib/version-store.ts";
import { validateCatalogDetails } from "../src/lib/catalog-details.ts";
const fixture = JSON.parse(
  readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
);
function snapshot(prices) {
  const s = structuredClone(fixture);
  s.brief.adults = 2;
  s.brief.children = 1;
  s.brief.budget = 900;
  s.itinerary[0].items = prices.map((pricing, i) => ({
    id: String(i),
    title: `Serviço ${i}`,
    time: "Por agendar",
    category: "activity",
    catalogDetails: {
      location: "",
      price: "Referência original",
      supplier: "",
      contact: "",
      hours: "",
      accessibility: "",
      dietary: "",
      verification: "",
      pricing,
    },
  }));
  return s;
}
const price = (amount, unit = "person", currency = "EUR", status = "estimated") => ({
  amount,
  unit,
  currency,
  status,
});
test("person, group and service subtotals use cents and currencies remain separate", () => {
  const s = snapshot([price("10.10"), price("25", "group"), price("12", "service", "USD")]);
  const b = proposalBudget(s);
  assert.equal(b.lines[0].quantity, 3);
  assert.equal(b.lines[0].subtotalCents, 3030);
  assert.equal(b.lines[1].quantity, 1);
  assert.equal(b.totals.EUR.estimated, 5530);
  assert.equal(b.totals.USD.estimated, 1200);
  assert.equal(s.brief.budget, 900);
});
test("unknown and pending prices are not zero; explicit free prices are calculable", () => {
  const b = proposalBudget(
    snapshot([
      price("", "group", "EUR", "pending"),
      price("0"),
      price("50", "group", "EUR", "pending"),
    ]),
  );
  assert.equal(b.lines[0].subtotalCents, null);
  assert.equal(b.lines[1].subtotalCents, 0);
  assert.equal(b.lines[2].subtotalCents, null);
  assert.equal(b.incomplete, true);
  assert.deepEqual(proposalBudget(snapshot([price("", "group", "EUR", "pending")])).totals, {});
});
test("manual trip prices win and cleared fields never reuse catalogue prices", () => {
  const s = snapshot([price("10")]);
  const item = s.itinerary[0].items[0];
  item.confirmation = { price: "15 EUR por pessoa", status: "confirmed" };
  assert.equal(proposalBudget(s).lines[0].subtotalCents, 4500);
  assert.equal(proposalBudget(s).lines[0].status, "Confirmado");
  item.confirmation.price = "";
  assert.equal(proposalBudget(s).lines[0].subtotalCents, null);
  item.confirmation.price = "15 EUR a partir de, por pessoa";
  assert.equal(proposalBudget(s).lines[0].subtotalCents, null);
});
test("hourly prices do not infer billable hours from duration and transport remains unknown", () => {
  const s = snapshot([price("20", "hour")]);
  s.itinerary[0].items[0].duration = "2h";
  s.itinerary[0].items[0].transitToNext = { fromLocation: "A", toLocation: "B" };
  const b = proposalBudget(s);
  assert.equal(b.lines[0].unitCents, 2000);
  assert.equal(b.lines[0].quantity, null);
  assert.equal(b.lines[1].subtotalCents, null);
});
test("catalogue confirmed prices remain estimates until the trip is confirmed", () => {
  const s = snapshot([price("20", "group", "EUR", "confirmed")]);
  assert.equal(proposalBudget(s).lines[0].status, "Estimativa");
  s.itinerary[0].items[0].catalogDetails.inclusions = "Entrada";
  s.itinerary[0].items[0].catalogDetails.taxes = "IVA incluído";
  assert.equal(proposalBudget(s).terms[0].taxes, "IVA incluído");
  assert.throws(() =>
    validateCatalogDetails({ ...s.itinerary[0].items[0].catalogDetails, pricing: price("-1") }),
  );
});
test("budget is the final PDF section and retains unknown costs, terms and customer limit", async () => {
  const s = snapshot([price("10"), price("", "group", "EUR", "pending")]);
  s.itinerary[0].items[0].catalogDetails.inclusions = "Bilhete de entrada";
  s.itinerary[0].items[0].catalogDetails.exclusions = "Bebidas";
  s.itinerary[0].items[0].catalogDetails.taxes = "IVA incluído no preço";
  const capture = [];
  const before = JSON.stringify(s);
  const meta = {
    tripId: "budget",
    version: 1,
    filename: "budget.pdf",
    createdAt: "2026-10-03T12:00:00Z",
    parentVersion: null,
    snapshotHash: "a".repeat(64),
    chainHash: "b".repeat(64),
  };
  await renderPdf(s, meta, { capture });
  assert.ok(capture.indexOf("Orçamento da proposta") > capture.indexOf("Identificação da versão"));
  for (const text of [
    "Subtotal conhecido — proposta incompleta",
    "Inclusões: Bilhete de entrada",
    "Exclusões: Bebidas",
    "Impostos / taxas: IVA incluído no preço",
    "Por confirmar",
  ])
    assert.ok(capture.includes(text), text);
  assert.ok(capture.some((t) => t.startsWith("Orçamento disponível do cliente: 900.00 EUR")));
  assert.equal(JSON.stringify(s), before);
});
test("historical budgets retain the captured price after subsequent catalogue edits", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "blu-budget-"));
  const store = new VersionStore(dir);
  try {
    const s = snapshot([price("10")]);
    store.save("budget", s, "generated", null);
    const pdf = await store.pdf("budget", 1);
    s.itinerary[0].items[0].catalogDetails.pricing.amount = "100";
    s.brief.budget = 2000;
    store.save("budget", s, "edited", 1);
    assert.equal(
      proposalBudget(JSON.parse(store.get("budget", 1).snapshot)).totals.EUR.estimated,
      3000,
    );
    assert.deepEqual((await store.pdf("budget", 1)).bytes, pdf.bytes);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("long budgets repeat the table header and translated columns remain renderable", async () => {
  const s = snapshot(Array.from({ length: 45 }, () => price("10")));
  const meta = {
    tripId: "long-budget",
    version: 1,
    filename: "budget.pdf",
    createdAt: "2026-10-03T12:00:00Z",
    parentVersion: null,
    snapshotHash: "a".repeat(64),
    chainHash: "b".repeat(64),
  };
  const capture = [];
  await renderPdf(s, meta, { capture });
  assert.ok(capture.filter((s) => s === "Orçamento da proposta").length > 1);
  const translations = new Map(capture.map((t) => [t, t + " (tradução mais extensa)"]));
  const pdf = await renderPdf(s, meta, { translations });
  assert.match(pdf.toString("latin1"), /%%EOF/);
});
