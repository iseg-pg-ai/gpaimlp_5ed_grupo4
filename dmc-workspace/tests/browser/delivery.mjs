import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const snapshot = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
    Object.assign(snapshot.brief, {
      childrenAges: "",
      specialOccasion: "",
      notes: "",
      accommodation: "Boutique",
      diningPace: "Relaxed Dining (~90m)",
    });
    await page.addInitScript((s) => {
      localStorage.setItem("blu-portal-language", "pt");
      localStorage.setItem(
        "blu-trips-v1",
        JSON.stringify([
          { ...s, id: "delivery-test", version: 3, clientLanguage: "en", messages: [] },
        ]),
      );
    }, snapshot);
    let exported = false;
    await page.route("**/api/versions?*", (r) => {
      const params = new URL(r.request().url()).searchParams;
      if (params.get("format") === "bundle") {
        assert.equal(params.get("version"), "3");
        assert.equal(params.get("locale"), "en");
        exported = true;
        return r.fulfill({
          body: "test-zip",
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="proposal.zip"',
          },
        });
      }
      return r.fulfill({
        json: [
          {
            version: 3,
            filename: "BLU_Test_v003.pdf",
            createdAt: "2026-10-03T12:00:00Z",
            exportedLocales: exported ? ["en", "pt"] : [],
          },
        ],
      });
    });
    await page.route("**/api/versions", (r) => r.fulfill({ json: { version: 3 } }));
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
    await page.goto(process.env.PORTAL_URL || "http://127.0.0.1:3001");
    if (width < 1024) await page.locator('[aria-controls="trip-navigation"]').click();
    await page
      .locator("aside:visible button")
      .filter({ hasText: snapshot.brief.customerName })
      .click();
    const panel = page.getByTestId("delivery-panel");
    assert.match(await panel.textContent(), /Versão 003 · Português.*English/);
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Descarregar PDFs", exact: true }).click();
    await download;
    const history = page.getByTestId("delivery-history");
    await history.locator("summary").click();
    await history.getByRole("link", { name: "English · PDF", exact: true }).waitFor();
    assert.ok(
      await history.getByRole("link", { name: "Português · PDF", exact: true }).isVisible(),
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    console.log(width, "delivery panel, version, download and archived languages OK");
    await page.close();
  }
} finally {
  await browser.close();
}
