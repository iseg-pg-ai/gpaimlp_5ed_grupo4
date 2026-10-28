import { launchBrowser, readSnapshot, mockTranslation } from "./helpers.mjs";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initialConfirmation } from "../../src/lib/activity-confirmation.ts";

const base = process.env.PORTAL_URL ?? "http://127.0.0.1:3001";
const output = new URL("../../../.tools/prompt-smoke/", import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await launchBrowser();
try {
  const context = await browser.newContext();
  const snapshot = readSnapshot();
  Object.assign(snapshot.brief, {
    customerName: "Cliente de teste TXT",
    childrenAges: "",
    specialOccasion: "",
    notes: "PRIVATE_BRIEF_NOTE",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  const item = snapshot.itinerary[0].items[0];
  item.confirmation = initialConfirmation(item);
  Object.assign(item.confirmation, {
    contact: "PRIVATE_CONTACT",
    reference: "PRIVATE_BOOKING",
    notes: "PRIVATE_NOTE",
  });
  const tripId = `prompt-smoke-${Date.now()}`;
  const save = async (content, baseVersion) => {
    const response = await context.request.post(`${base}/api/versions`, {
      data: { tripId, snapshot: content, reason: "generated", baseVersion },
    });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const first = await save(snapshot, null);
  const url = (version, locale = "fr") =>
    `${base}/api/versions?tripId=${tripId}&version=${version}&format=prompt&locale=${locale}`;
  const firstResponse = await context.request.get(url(first.version));
  assert.equal(firstResponse.status(), 200);
  assert.match(firstResponse.headers()["content-type"], /text\/plain; charset=utf-8/);
  assert.match(firstResponse.headers()["cache-control"], /no-store/);
  assert.match(firstResponse.headers()["content-disposition"], /_Prompt_FR\.txt/);
  const original = await firstResponse.text();
  assert.match(original, /blu-roteiro-prompt\/1\.0\.0/);
  assert.doesNotMatch(original, /PRIVATE_/);
  assert.equal(await (await context.request.get(url(999))).status(), 404);
  assert.equal(await (await context.request.get(url(first.version, "invalid"))).status(), 400);
  const changed = structuredClone(snapshot);
  changed.itinerary[0].items[0].title = "Atividade atualizada no dashboard";
  const second = await save(changed, first.version);
  assert.equal(await (await context.request.get(url(first.version))).text(), original);
  const guarded = await (
    await context.request.get(`${base}/api/versions?tripId=${tripId}&version=${second.version}`)
  ).json();
  assert.equal(guarded.meta.exportedAt, null);
  assert.equal(guarded.snapshot.itinerary[0].items[0].title, changed.itinerary[0].items[0].title);
  for (const action of ["trash", "restore"]) {
    const response = await context.request.post(`${base}/api/versions/trash`, {
      data: { tripId, version: first.version, action },
    });
    assert.equal(response.status(), 200, await response.text());
    const download = await context.request.get(url(first.version));
    assert.equal(download.status(), action === "trash" ? 409 : 200);
    if (action === "restore") assert.equal(await download.text(), original);
  }
  await context.close();

  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ snapshot, tripId, version }) => {
        localStorage.setItem("blu-portal-language", "pt");
        localStorage.setItem(
          "blu-trips-v1",
          JSON.stringify([
            { ...snapshot, id: tripId, version, clientLanguage: "fr", messages: [] },
          ]),
        );
      },
      { snapshot: changed, tripId, version: second.version },
    );
    await mockTranslation(page);
    await page.goto(base);
    if (width < 1024) await page.locator('button[aria-controls="trip-navigation"]').click();
    await page
      .locator("aside:visible button")
      .filter({ hasText: changed.brief.customerName })
      .click();
    const button = page.getByTestId("export-prompt-txt");
    await button.waitFor({ state: "visible" });
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /_Prompt_FR\.txt$/);
    const text = readFileSync(await download.path(), "utf8");
    const content = JSON.parse(text.slice(text.indexOf("\n\n{\n") + 2));
    assert.equal(content.formato, "blu-roteiro-prompt/1.0.0");
    assert.equal("modeloVisual" in content, false);
    assert.equal(content.dias[0].atividades[0].titulo, changed.itinerary[0].items[0].title);
    assert.equal(content.codigoIdioma, "fr");
    assert.equal(content.versao.numero, second.version);
    assert.doesNotMatch(text, /PRIVATE_/);
    assert.equal(await page.locator('[data-status="exported"]').count(), 0);
    await button.waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="export-prompt-txt"]').disabled,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const bounds = await button.boundingBox();
    await page.screenshot({
      path: fileURLToPath(new URL(`prompt-${width}.png`, output)),
      fullPage: true,
    });
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 44,
      JSON.stringify({ width, bounds }),
    );
    assert.deepEqual(errors, []);
    console.log(`TXT download and layout OK at ${width}px`);
    await context.close();
  }
  console.log("Historical TXT, trash/restore, invalid inputs, privacy and unchanged PDF state OK");
} finally {
  await browser.close();
}
