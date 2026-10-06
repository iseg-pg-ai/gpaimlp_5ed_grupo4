import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snapshot = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
  Object.assign(snapshot.brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  await page.addInitScript((trip) => {
    localStorage.setItem("blu-portal-language", "pt");
    localStorage.setItem(
      "blu-trips-v1",
      JSON.stringify([{ ...trip, id: "eligible-browser", version: 1, messages: [] }]),
    );
  }, snapshot);
  await page.route("**/api/translate", (route) =>
    route.fulfill({
      json: {
        texts: route
          .request()
          .postDataJSON()
          .items.map((item) => item.text),
      },
    }),
  );
  await page.route("**/api/trash/cleanup", (route) =>
    route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } }),
  );
  await page.route("**/api/versions?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/versions", (route) => route.fulfill({ json: { version: 2 } }));
  let eligibilityRequest;
  await page.route("**/api/catalog/eligible", (route) => {
    eligibilityRequest = route.request().postDataJSON();
    return route.fulfill({
      json: [
        {
          id: "cat-compatible0001",
          category: "experiencias",
          status: "approved",
          fields: {
            name: "Experiência compatível",
            location: "Lisboa",
            description: "Opção validada pelo briefing e pelas regras.",
            duration: "60 min",
            price: "50 EUR",
          },
        },
      ],
    });
  });
  let assistantRequest;
  await page.route("**/api/assistant", (route) => {
    assistantRequest = route.request().postDataJSON();
    const itinerary = structuredClone(assistantRequest.snapshot.itinerary);
    const day = itinerary[0];
    day.items[0].transitToNext = {
      id: "leg-compatible",
      fromLocation: day.items[0].title,
      toLocation: "Experiência compatível",
      mode: "chauffeur",
      duration: "12 min",
      distance: "6.0 km",
      routeNote: "Percurso calculado",
      bufferMinutes: 10,
      isAlgorithmOptimized: true,
    };
    day.items.push({
      id: "experiencias:cat-compatible0001",
      time: "15:00–16:00 (proposto)",
      title: "Experiência compatível",
      description: "Opção validada pelo briefing e pelas regras.",
      category: "experience",
      location: "Lisboa",
      duration: "60 min",
      pendingChecks: ["Confirmar disponibilidade"],
      appliedRules: ["Briefing e curadoria validados"],
    });
    day.routeSummary = {
      totalTransitTime: "12 min",
      totalDistance: "6.0 km",
      legsCount: 1,
      walkingDistance: "0 m",
      routePath: [day.items[0].title, "Experiência compatível"],
      algorithmStatus: "Viável e Otimizado",
    };
    return route.fulfill({ json: { itinerary, changed: true, reply: "Atividade adicionada." } });
  });

  await page.goto(process.env.PORTAL_URL || "http://localhost:3001");
  const tripButton = page
    .locator("aside:visible button")
    .filter({ hasText: snapshot.brief.customerName });
  await tripButton.waitFor();
  await tripButton.click();
  await page.getByTitle("Adicionar oferta do catálogo a este dia").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Experiência compatível", { exact: true }).waitFor();
  assert.equal(await dialog.getByText("Museu incompatível", { exact: true }).count(), 0);
  await dialog.getByRole("button", { name: /Adicionar ao Dia/i }).click();
  await page.getByText("Experiência compatível", { exact: true }).waitFor();
  assert.equal(eligibilityRequest.dayNumber, 1);
  assert.match(assistantRequest.input, /experiencias:cat-compatible0001/);
  assert.ok(assistantRequest.snapshot.itinerary[0].dailyCapacity >= 2);
  assert.ok(
    await page
      .getByText(/12 min/)
      .first()
      .isVisible(),
  );
  console.log("Eligible addition: filtered catalog, atomic capacity and transit connector OK");
} finally {
  await browser.close();
}
