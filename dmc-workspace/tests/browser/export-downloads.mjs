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
      await page.addInitScript(() => localStorage.setItem("blu-portal-language", "pt"));
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
      const trashAction = { tripId, version: 1, action: "trash" };
      const denied = await context.request.post(`${portal}/api/versions/trash`, {
        headers: { Origin: "https://untrusted.example" },
        data: trashAction,
      });
      assert.equal(denied.status(), 403);
      const deniedForm = await context.request.post(`${portal}/api/versions/trash`, {
        headers: { Origin: "https://untrusted.example" },
        form: { tripId, version: "1", action: "trash" },
      });
      assert.equal(deniedForm.status(), 403);
      const missingOrigin = await context.request.post(`${portal}/api/versions/trash`, {
        form: { tripId, version: "1", action: "trash" },
      });
      assert.equal(missingOrigin.status(), 403);
      const nativeTrash = page
        .getByTestId("version-trash-form")
        .filter({ has: page.locator(`input[name="tripId"][value="${tripId}"]`) });
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes("/api/versions/trash") &&
            response.status() === 303,
        ),
        nativeTrash.locator('button[type="submit"]').click(),
      ]);
      await nativeTrash.waitFor({ state: "detached" });
      const trashed = await context.request.get(`${portal}/api/versions/trash`);
      assert.ok((await trashed.json()).some((version) => version.tripId === tripId));
      const restored = await context.request.post(`${portal}/api/versions/trash`, {
        data: { ...trashAction, action: "restore" },
      });
      assert.equal(restored.status(), 200);
      await page.goto(`${portal}/exports`);
      await nativeTrash.locator('input[name="version"]').evaluate((input) => {
        input.value = "999";
      });
      await nativeTrash.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: "Versão não encontrada." }).waitFor();
      assert.equal(
        (await context.request.get(`${portal}/api/versions?tripId=${tripId}&version=1`)).status(),
        200,
      );
      console.log(
        width,
        `JavaScript=${javaScriptEnabled}`,
        "native downloads, version trash, JSON restore, form errors and origin validation OK",
      );
      await context.close();
    }
} finally {
  await browser.close();
}
