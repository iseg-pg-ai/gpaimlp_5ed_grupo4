import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetOf, datesOf, durationOf, leadToBrief, partyOf } from "../src/lib/lead-brief.ts";
import { validateBrief } from "../src/lib/curation.ts";

const TODAY = "2026-10-26";
const base = {
  customerName: "",
  customerEmail: "",
  adults: 2,
  children: 0,
  childrenAges: "",
  destination: "",
  startDate: "",
  endDate: "",
  arrivalLocation: "",
  arrivalTime: "",
  arrivalFlightNumber: "",
  departureLocation: "",
  departureTime: "",
  departureFlightNumber: "",
  budget: 0,
  currency: "EUR",
  interests: [],
  pace: "Balanced",
  accommodation: "Boutique",
  proposalTier: "Classic",
  physicalEffort: "Moderado (Moderate)",
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  diningPace: "Relaxed Dining (~90m)",
  morningPreference: "Standard (09:30)",
  exclusions: [],
  specialOccasion: "",
  notes: "",
};

test("dates are read from what the customer wrote, in English and Portuguese", () => {
  assert.deepEqual(datesOf("12–18 May 2027", TODAY), {
    startDate: "2027-05-12",
    endDate: "2027-05-18",
    assumed: [],
  });
  assert.deepEqual(datesOf("25 nov – 10 dez 2026", TODAY), {
    startDate: "2026-11-25",
    endDate: "2026-12-10",
    assumed: [],
  });
  assert.equal(datesOf("mid-March", TODAY).startDate, "2027-03-12");
  assert.equal(datesOf("meados de março 2027 · 1 semana", TODAY).endDate, "2027-03-18");
  assert.equal(datesOf("after 2026-10-25", TODAY).startDate, "2026-10-26");
  assert.equal(datesOf("3 days", TODAY).endDate, "2026-11-27");
  // «mar» (o mar) e «may» (verbo) não são meses sozinhos.
  assert.match(datesOf("praia e mar", TODAY).assumed.join(" "), /Sem datas/);
  assert.match(datesOf("we may go", TODAY).assumed.join(" "), /Sem datas/);
  assert.equal(durationOf("5 noites"), 6);
  assert.equal(durationOf("one week"), 7);
});

test("travellers and budget come from the chat, with guesses flagged", () => {
  assert.deepEqual(partyOf("2 adults"), { adults: 2, children: 0, assumed: [] });
  assert.deepEqual(partyOf("casal"), { adults: 2, children: 0, assumed: [] });
  assert.equal(partyOf("4 people").adults, 4);
  assert.equal(partyOf("family").children, 2);
  assert.match(partyOf("group of friends").assumed[0], /4 adultos/);
  assert.deepEqual(budgetOf("€6,000"), { budget: 6000, currency: "EUR", assumed: [] });
  assert.equal(budgetOf("3000–6000 EUR").budget, 6000);
  assert.deepEqual(budgetOf("6k USD"), {
    budget: 6000,
    currency: "EUR",
    assumed: ["Orçamento dito em USD (6000): converter para EUR."],
  });
  assert.match(budgetOf("").assumed[0], /orçamento/i);
});

test("a lead becomes a valid rough brief that lists every assumption", () => {
  const { brief, assumptions } = leadToBrief(
    {
      id: "BLU-DEMO000000000004",
      journey: {
        destination: "Algarve e Açores",
        timeframe: "mid-March",
        party: "2 adults",
        budget: "3000–6000 EUR",
        interests: "surf, vinho, vegano",
      },
      emails: ["demo@example.com"],
    },
    base,
    TODAY,
  );
  validateBrief(brief);
  assert.equal(brief.destination, "Algarve e Açores");
  assert.equal(brief.startDate, "2027-03-12");
  assert.equal(brief.adults, 2);
  assert.equal(brief.budget, 6000);
  assert.deepEqual(brief.interests, [
    "Gastronomy & Petiscos",
    "Douro & Alentejo Wines",
    "Atlantic Coast & Nature",
  ]);
  assert.deepEqual(brief.dietaryRestrictions, ["Vegan"]);
  assert.equal(brief.arrivalLocation, "Faro Airport (FAO)");
  assert.equal(brief.customerEmail, "demo@example.com");
  assert.ok(assumptions.some((item) => /Nome do cliente/.test(item)));
  assert.match(brief.notes, /Pressupostos:/);
  assert.match(brief.notes, /Confirmar com o cliente antes de enviar/);
});

test("an almost empty lead still gives a brief the curator can complete", () => {
  const { brief, assumptions } = leadToBrief({ id: "BLU-AAAAAAAA0001", journey: {} }, base, TODAY);
  // Sem orçamento não se gera nada: o curador tem de o indicar primeiro.
  assert.throws(() => validateBrief(brief), /orçamento/);
  validateBrief({ ...brief, budget: 2500 });
  assert.equal(brief.destination, "Portugal");
  assert.equal(brief.startDate, "2026-11-25");
  assert.ok(assumptions.some((item) => /Sem email/.test(item)));
});
