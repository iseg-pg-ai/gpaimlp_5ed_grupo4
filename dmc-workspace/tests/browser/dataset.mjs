import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? "msedge",
});
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => localStorage.setItem("blu-portal-language", "pt"));
    await page.goto((process.env.PORTAL_URL ?? "http://127.0.0.1:3001") + "/references");
    const section = page.getByTestId("dataset-explorer");
    await section
      .locator('select option[value="structured_atracoes_base"]')
      .waitFor({ state: "attached" });
    await section.locator("select").selectOption("structured_atracoes_base");
    await section.locator("input").fill("Castelo de São Jorge");
    await section.locator("details summary").filter({ hasText: "Castelo de São Jorge" }).click();
    await section.getByText("latitude", { exact: true }).waitFor();
    assert.equal(await section.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
    const response = await page.request.get(
      (process.env.PORTAL_URL ?? "http://127.0.0.1:3001") +
        "/api/dataset?table=structured_precos_base",
    );
    assert.ok(response.ok());
    const data = await response.json();
    assert.ok(data.total > 25);
    assert.equal(data.rows.length, 25);
    assert.ok(data.tables.includes("structured_fontes_enriquecimento"));
    assert.equal(
      (
        await page.request.get(
          (process.env.PORTAL_URL ?? "http://127.0.0.1:3001") + "/api/dataset?table=../secret",
        )
      ).status(),
      400,
    );
    console.log(width, "dataset search, complete fields, pagination and table allowlist OK");
    await page.close();
  }
} finally {
  await browser.close();
}
