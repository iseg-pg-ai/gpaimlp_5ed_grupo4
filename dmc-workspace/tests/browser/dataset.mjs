import { launchBrowser, mockTranslation } from "./helpers.mjs";
import assert from "node:assert/strict";
const browser = await launchBrowser();
try {
  for (const width of [360, 1440])
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        javaScriptEnabled,
      });
      const page = await context.newPage();
      await mockTranslation(page);
      await page.addInitScript(() => localStorage.setItem("blu-portal-language", "pt"));
      await page.goto((process.env.PORTAL_URL ?? "http://127.0.0.1:3001") + "/references");
      const section = page.getByTestId("dataset-explorer");
      await section
        .locator('select option[value="structured_atracoes_base"]')
        .waitFor({ state: "attached" });
      await section.locator("select").selectOption("structured_atracoes_base");
      await section.locator("input").fill("Castelo de São Jorge");
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get("q") === "Castelo de São Jorge"),
        section.locator('button[type="submit"]').click(),
      ]);
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
      await section.locator("select").selectOption("structured_precos_base");
      await section.locator("input").fill("");
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.searchParams.get("table") === "structured_precos_base" &&
            url.searchParams.get("q") === "",
        ),
        section.locator('button[type="submit"]').click(),
      ]);
      assert.equal(await section.locator("details").count(), 25);
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get("page") === "2"),
        section.getByRole("link", { name: "Seguinte", exact: true }).click(),
      ]);
      assert.equal(new URL(page.url()).searchParams.get("table"), "structured_precos_base");
      assert.ok((await section.locator("details").count()) > 0);
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get("page") === "1"),
        section.getByRole("link", { name: "Anterior", exact: true }).click(),
      ]);
      assert.equal(await section.locator("details").count(), 25);
      console.log(
        width,
        `JavaScript=${javaScriptEnabled}`,
        "HTML search, fields, pagination and API allowlist OK",
      );
      await context.close();
    }
} finally {
  await browser.close();
}
