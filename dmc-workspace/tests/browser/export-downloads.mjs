import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launchBrowser, mockTranslation, readSnapshot } from "./helpers.mjs";
const browser = await launchBrowser();
const portal = process.env.PORTAL_URL ?? "http://localhost:3001";
try {
  const setup = await browser.newContext();
  const snapshot = readSnapshot();
  Object.assign(snapshot.brief, {
    customerName: "Teste downloads HTML",
    childrenAges: "",
    specialOccasion: "",
    notes: "PRIVATE_NOTES",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  const tripId = `html-downloads-${Date.now()}`;
  const saved = await setup.request.post(`${portal}/api/versions`, {
    data: { tripId, snapshot, reason: "generated", baseVersion: null },
  });
  assert.equal(saved.status(), 200, await saved.text());
  await setup.close();
  for (const width of [320, 1440])
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        javaScriptEnabled,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      await mockTranslation(page);
      await page.goto(`${portal}/exports`);
      const form = page
        .getByTestId("export-downloads")
        .filter({ has: page.locator(`input[name="tripId"][value="${tripId}"]`) });
      await form.locator('select[name="locale"]').selectOption("fr");
      const txtPromise = page.waitForEvent("download");
      await form.locator('button[value="prompt"]').click();
      const txt = await txtPromise;
      assert.match(txt.suggestedFilename(), /_Canva_FR\.txt$/);
      const text = await readFile(await txt.path(), "utf8");
      assert.match(text, /"codigoIdioma": "fr"/);
      assert.doesNotMatch(text, /PRIVATE_NOTES/);
      await form.locator('select[name="locale"]').selectOption("pt");
      const pdfPromise = page.waitForEvent("download");
      await form.locator('button[value="bundle"]').click();
      const pdf = await pdfPromise;
      const bytes = await readFile(await pdf.path());
      assert.equal(bytes.subarray(0, 2).toString(), "PK");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      console.log(
        width,
        `JavaScript=${javaScriptEnabled}`,
        "native form TXT language/privacy and PDF bundle downloads OK",
      );
      await context.close();
    }
} finally {
  await browser.close();
}
