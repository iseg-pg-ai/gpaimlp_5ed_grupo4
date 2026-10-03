import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? "msedge",
});
try {
  for (const corrupted of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const snapshot = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
    Object.assign(snapshot.brief, {
      childrenAges: "",
      specialOccasion: "",
      notes: "",
      accommodation: "Boutique",
      diningPace: "Relaxed Dining (~90m)",
    });
    if (corrupted) snapshot.itinerary[0].items = [null];
    const original = JSON.stringify([
      { ...snapshot, id: "recovery-test", version: 1, messages: [] },
    ]);
    await page.addInitScript((raw) => {
      localStorage.setItem("blu-portal-language", "pt");
      localStorage.setItem("blu-trips-v1", raw);
    }, original);
    await page.route("**/api/translate", (r) =>
      r.fulfill({
        json: {
          texts: r
            .request()
            .postDataJSON()
            .items.map((i) => i.text),
        },
      }),
    );
    await page.route("**/api/versions?*", (r) =>
      r.fulfill({
        json: r.request().url().includes("&version=")
          ? { snapshot: { itinerary: [null] }, meta: { version: 2 } }
          : [{ version: 2, filename: "test.pdf", createdAt: "2026-10-01T12:00:00Z" }],
      }),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.PORTAL_URL ?? "http://127.0.0.1:3001");
    if (corrupted) {
      await page
        .getByRole("alert")
        .filter({ hasText: /Não foi possível|inválido/ })
        .waitFor();
    } else {
      await page
        .locator("aside:visible button")
        .filter({ hasText: snapshot.brief.customerName })
        .click();
      await page.getByTestId("delivery-history").locator("summary").click();
      await page.getByRole("button", { name: "Reabrir última versão guardada" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: /Não foi possível|inválido/ })
        .waitFor();
      assert.ok(await page.getByTestId("activity-card").first().isVisible());
    }
    assert.equal(await page.evaluate(() => localStorage.getItem("blu-trips-v1")), original);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Invalid local data and invalid reopen responses preserve stored trips without crashes OK",
  );
} finally {
  await browser.close();
}
