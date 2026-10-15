import { launchBrowser, readSnapshot, mockTranslation } from "./helpers.mjs";
import assert from "node:assert/strict";

const browser = await launchBrowser();
try {
  for (const width of [390, 1600]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const snapshot = readSnapshot();
    Object.assign(snapshot.brief, {
      childrenAges: "",
      specialOccasion: "",
      notes: "",
      accommodation: "Boutique",
      diningPace: "Relaxed Dining (~90m)",
    });
    snapshot.itinerary[0].items.forEach((item) => {
      item.isLocked = false;
      delete item.confirmation;
    });
    // O histórico devolve as chaves ordenadas, ao contrário do rascunho original.
    const sorted = (value) =>
      Array.isArray(value)
        ? value.map(sorted)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, sorted(item)]),
            )
          : value;
    const before = sorted(structuredClone(snapshot));
    const after = structuredClone(snapshot);
    after.itinerary[0].items.pop();
    let accepted = 0;
    let rejected = 0;
    let versionWrites = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((s) => {
      localStorage.setItem("blu-portal-language", "pt");
      localStorage.setItem(
        "blu-trips-v1",
        JSON.stringify([{ ...s, id: "assistant-browser", version: 1, messages: [] }]),
      );
    }, snapshot);
    await page.route("**/api/versions?*", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/versions", (route) => {
      versionWrites++;
      return route.fulfill({ json: { version: 2 } });
    });
    await page.route("**/api/assistant/plan", (route) => {
      const body = route.request().postDataJSON();
      if (body.decision === "accept") {
        accepted++;
        return route.fulfill({ json: { snapshot: after, version: 2 } });
      }
      if (body.decision === "reject") {
        rejected++;
        return route.fulfill({ json: { rejected: true } });
      }
      return route.fulfill({
        json: {
          runId: "synthetic-run",
          tripId: "assistant-browser",
          baseVersion: 1,
          provider: "bedrock",
          modelId: "mock",
          before: before.itinerary,
          after: after.itinerary,
          plan: {
            summary: "Proponho remover a última atividade do dia 1.",
            actions: [
              { type: "remove_item", dayNumber: 1, itemId: before.itinerary[0].items.at(-1).id },
            ],
            warnings: [],
            requiresConfirmation: true,
          },
        },
      });
    });
    await mockTranslation(page);
    await page.goto(process.env.PORTAL_URL || "http://127.0.0.1:3001");
    if (width < 1024) await page.locator('button[aria-controls="trip-navigation"]').click();
    await page
      .locator("aside:visible button")
      .filter({ hasText: snapshot.brief.customerName })
      .click();
    if (width < 1280) await page.locator('button[aria-controls="curation-assistant"]').click();
    const input = page.getByRole("textbox", { name: "Mensagem para o assistente" });
    const readTrip = () => page.evaluate(() => JSON.parse(localStorage.getItem("blu-trips-v1"))[0]);
    const request = async () => {
      await input.fill("Alivia o dia 1 removendo a última atividade");
      await input.press("Enter");
      await page.getByTestId("agent-preview").waitFor();
    };
    await request();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "A pré-visualização deve caber no ecrã",
    );
    assert.deepEqual((await readTrip()).itinerary, before.itinerary);
    assert.equal((await readTrip()).version, 1);
    await page.getByRole("button", { name: "Rejeitar", exact: true }).click();
    await page.getByTestId("agent-preview").waitFor({ state: "hidden" });
    assert.deepEqual((await readTrip()).itinerary, before.itinerary);
    await request();
    await page.getByRole("button", { name: "Aceitar e guardar versão", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("blu-trips-v1"))[0].version === 2,
    );
    assert.deepEqual((await readTrip()).itinerary, after.itinerary);
    assert.equal(accepted, 1);
    assert.equal(rejected, 1);
    assert.equal(versionWrites, 0, "As mensagens e decisões não devem criar versões duplicadas");
    assert.deepEqual(errors, []);
    console.log(`Proposta → rejeitar → propor → aceitar: ${width}px OK`);
    await page.close();
  }
} finally {
  await browser.close();
}
