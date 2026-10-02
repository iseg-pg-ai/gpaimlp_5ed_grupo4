import { emptyPersonalization, validatePersonalization } from "../src/lib/brief-personalization.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMatching, validateMatching } from "../src/lib/catalog-matching.ts";
import { generateItinerary } from "../src/lib/curation.ts";

const brief = {
  customerName: "Test",
  destination: "Lisboa",
  startDate: "2026-10-10",
  endDate: "2026-10-10",
  arrivalLocation: "Lisboa",
  departureLocation: "Lisboa",
  adults: 2,
  children: 0,
  childrenAges: "",
  budget: 200,
  currency: "EUR",
  interests: ["Culture & Heritage"],
  pace: "Relaxed",
  accommodation: "Boutique",
  proposalTier: "Soft",
  physicalEffort: "Baixo (Low)",
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  diningPace: "Relaxed Dining (~90m)",
  morningPreference: "Late Start (10:30+)",
  exclusions: [],
  specialOccasion: "",
  notes: "",
};
const row = (id, matching = {}) => ({
  id,
  cidade: "Lisboa",
  nome_da_atracao: id,
  descricao_curada: "Oferta",
  esforco_fisico: "Baixo",
  _catalog_status: "approved",
  _source_row: 1,
  _matching: { ...emptyMatching(), food: "no", children: "allowed", ...matching },
});
function generate(rows, changes = {}, restaurants = []) {
  return generateItinerary(
    { ...brief, ...changes },
    {
      atracoes: rows,
      restaurantes: restaurants,
      experiencias: [],
      curation_rules: [
        "R01",
        "R03",
        "R04",
        "R05",
        "R09",
        "R15",
        "R16",
        "R33",
        "R40",
        "R41",
        "R43",
      ].map((id) => ({ id })),
    },
  ).itinerary.flatMap((d) => d.items);
}
test("explicit interests rank an opaque title ahead of generic records and explain the match", () => {
  const result = generate([row("Generic"), row("Tagged", { interests: ["Culture & Heritage"] })]);
  assert.equal(result[0].title, "Tagged");
  assert.ok(result[0].appliedRules.some((r) => r.includes("Interesses associados")));
});
test("tier, pace, morning, dates and explicit exclusions constrain eligibility", () => {
  for (const profile of [
    { tiers: ["Signature"] },
    { paces: ["Active"] },
    { mornings: ["Early (08:30)"] },
    { validFrom: "2026-10-11" },
    { validUntil: "2026-10-09" },
    { excludedBy: ["No Open Boats (Sea Sickness)"] },
  ]) {
    assert.equal(
      generate([row("Opaque", profile)], { exclusions: ["No Open Boats (Sea Sickness)"] }).length,
      0,
    );
  }
  assert.equal(
    generate([row("Inclusive", { validFrom: "2026-10-10", validUntil: "2026-10-10" })]).length,
    1,
  );
});
test("all mobility restrictions need documented matches", () => {
  const restrictions = ["Wheelchair Accessible Routes", "Limited Walking Distance (< 1km)"];
  const changes = { mobilityRestrictions: restrictions };
  assert.equal(generate([row("Unknown")], changes).length, 0);
  assert.equal(
    generate(
      [
        row("Partial", {
          mobilitySupported: restrictions.slice(0, 1),
          verificationNotes: "Supplier",
        }),
      ],
      changes,
    ).length,
    0,
  );
  assert.equal(
    generate(
      [
        row("Matched", {
          mobilitySupported: restrictions,
          verificationNotes: "Supplier, reviewed 2026-09-30",
        }),
      ],
      changes,
    ).length,
    1,
  );
});
test("generated cards carry catalog fields and do not repeat verified accessibility checks", () => {
  const needs = ["Wheelchair Accessible Routes"];
  const entry = {
    ...row("Visit", { mobilitySupported: needs, verificationNotes: "Verified with supplier" }),
    morada: "Rua A",
    contactos: "supplier@example.com",
    fornecedor: "Supplier",
    preco_da_atracao: "20 EUR",
    horario: "09:00-18:00",
    acessibilidade_nivel_de_confirmacao: "Accessible entrance",
  };
  const result = generate([entry], { mobilityRestrictions: needs });
  assert.equal(result.length, 1);
  assert.equal(result[0].catalogDetails.location, "Rua A");
  assert.equal(result[0].catalogDetails.contact, "supplier@example.com");
  assert.equal(result[0].catalogDetails.price, "20 EUR");
  assert.equal(result[0].time, "Por agendar");
  assert.ok(!result[0].pendingChecks.some((v) => /Acessibilidade/.test(v)));
  assert.ok(result[0].pendingChecks.some((v) => /Disponibilidade/.test(v)));
});
test("food restrictions require all verified options, including food experiences; meal pace is respected", () => {
  const dietary = ["Vegan", "Nut Allergy"];
  const changes = { dietaryRestrictions: dietary };
  const matched = row("Restaurant", {
    food: "yes",
    dietarySupported: dietary,
    verificationNotes: "Supplier: menu and cross-contact reviewed",
  });
  assert.equal(generate([], changes, [matched]).length, 1);
  assert.equal(generate([], changes, [row("Unknown")]).length, 0);
  assert.equal(generate([row("Food tour", { food: "yes" })], changes).length, 0);
  assert.equal(generate([row("Unknown experience", { food: "unknown" })], changes).length, 0);
  assert.equal(generate([row("No food")], changes).length, 1);
  assert.equal(
    generate([], changes, [
      { ...matched, _matching: { ...matched._matching, diningPaces: ["Quick Lunch (~40m)"] } },
    ]).length,
    0,
  );
});
test("family eligibility, minimum ages and whole-group capacity are checked", () => {
  const family = { children: 2, childrenAges: "5, 9" };
  for (const profile of [
    { children: "unknown" },
    { children: "adults_only" },
    { minAge: 6 },
    { maxGroup: 3 },
  ])
    assert.equal(generate([row("Restricted", profile)], family).length, 0);
  assert.equal(generate([row("Suitable", { minAge: 5, maxGroup: 4 })], family).length, 1);
  assert.equal(
    generate([row("Age required", { minAge: 5 })], { ...family, childrenAges: "" }).length,
    0,
  );
  assert.equal(generate([row("Adults 21+", { minAge: 21 })]).length, 0);
});
test("known per-person costs share the trip budget across days, with children included", () => {
  const priced = [
    row("One", { pricePerPerson: 30 }),
    row("Two", { pricePerPerson: 30 }),
    row("Three", { pricePerPerson: 30 }),
  ];
  assert.equal(generate(priced, { children: 1, endDate: "2026-10-11", budget: 180 }).length, 2);
  assert.equal(generate([row("Free", { pricePerPerson: 0 })], { budget: 1 }).length, 1);
});
test("bad profile values and undocumented compatibility cannot be saved or generated", () => {
  assert.equal(generate([{ ...row("Unknown effort"), esforco_fisico: "Por confirmar" }]).length, 0);
  for (const profile of [
    { interests: ["invented"] },
    { maxGroup: -1 },
    { pricePerPerson: "20" },
    { validFrom: "2026-02-30" },
    { dietarySupported: ["Vegan"] },
  ]) {
    assert.throws(() => validateMatching({ ...emptyMatching(), ...profile }));
    assert.equal(generate([row("Invalid", profile)]).length, 0);
  }
});

test("personalization prioritizes requested subcategories and respects exclusions", () => {
  const museum = { ...row("Museum"), subcategoria: "Museu e galeria" };
  const garden = { ...row("Garden"), subcategoria: "Jardim e parque" };
  const p = { ...emptyPersonalization(), mustHave: ["Jardim e parque"] };
  assert.equal(generate([museum, garden], { personalization: p })[0].title, "Garden");
  assert.deepEqual(
    generate([museum, garden, row("Unknown")], {
      personalization: { ...p, avoid: ["Museu e galeria"] },
    }).map((i) => i.title),
    ["Garden"],
  );
  assert.throws(() => validatePersonalization({ ...p, avoid: p.mustHave }));
});
test("budget flexibility is bounded and extra breaks reduce daily load", () => {
  const offer = row("Offer", { pricePerPerson: 105 });
  assert.equal(generate([offer]).length, 0);
  assert.equal(
    generate([offer], { personalization: { ...emptyPersonalization(), budgetFlex: 10 } }).length,
    1,
  );
  assert.throws(() => validatePersonalization({ ...emptyPersonalization(), budgetFlex: 100 }));
  const rows = [1, 2, 3, 4].map((i) => row(String(i)));
  assert.equal(generate(rows, { pace: "Active" }).length, 4);
  assert.equal(
    generate(rows, {
      pace: "Active",
      personalization: { ...emptyPersonalization(), extraBreaks: true },
    }).length,
    2,
  );
});
test("accompaniment requires explicit matching modality, not inferred descriptions", () => {
  const options = [
    { ...row("Guided"), modalidade: "Visita guiada" },
    { ...row("NoGuide"), modalidade: "Sem guia" },
    { ...row("Unknown"), descricao_curada: "guia privado" },
  ];
  assert.deepEqual(
    generate(options, {
      personalization: { ...emptyPersonalization(), accompaniment: "guided" },
    }).map((i) => i.title),
    ["Guided"],
  );
  assert.deepEqual(
    generate(options, {
      personalization: { ...emptyPersonalization(), accompaniment: "independent" },
    }).map((i) => i.title),
    ["NoGuide"],
  );
});
