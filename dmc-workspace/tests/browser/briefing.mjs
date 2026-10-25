import { launchBrowser, mockTranslation } from "./helpers.mjs";
import assert from "node:assert/strict";
const browser = await launchBrowser();
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => localStorage.setItem("blu-portal-language", "pt"));
    await mockTranslation(page);
    let submitted;
    await page.route("**/api/itineraries", (r) => {
      submitted = r.request().postDataJSON();
      return r.fulfill({ status: 503, json: { error: "Teste: catálogo indisponível" } });
    });
    await page.goto(process.env.PORTAL_URL ?? "http://127.0.0.1:3001");
    await page
      .locator("main button")
      .filter({ has: page.locator("svg.lucide-rotate-ccw") })
      .click();
    const formIssues = await page.locator("main").evaluate((main) => {
      const fields = [...main.querySelectorAll("input, select, textarea")];
      return {
        unidentified: fields
          .filter((field) => !field.id && !field.name)
          .map((field) => field.outerHTML),
        unlabelled: fields
          .filter(
            (field) =>
              !field.labels?.length &&
              !field.getAttribute("aria-label") &&
              !field.getAttribute("aria-labelledby"),
          )
          .map((field) => field.name),
        orphanLabels: [...main.querySelectorAll("label")]
          .filter((label) => !label.control)
          .map((label) => label.textContent),
        duplicateIds: fields
          .filter((field) => field.id && document.querySelectorAll(`[id="${field.id}"]`).length > 1)
          .map((field) => field.id),
      };
    });
    assert.deepEqual(formIssues, {
      unidentified: [],
      unlabelled: [],
      orphanLabels: [],
      duplicateIds: [],
    });
    const navigation = page.getByRole("navigation", { name: "Etapas do briefing" });
    await navigation.getByRole("button").nth(1).click();
    await page.locator('[name="arrivalTime"]').fill("10:35");
    await page.locator('[name="arrivalFlightNumber"]').fill("TP 1363");
    await page.locator('[name="departureTime"]').fill("17:20");
    await page.locator('[name="departureFlightNumber"]').fill("TP 1931");
    await navigation.getByRole("button").nth(2).click();
    const personal = page.getByTestId("brief-personalization");
    await personal.locator("details summary").first().click();
    await personal.locator('[name="mustHave"][value="Museu e galeria"]').check();
    await personal.locator('[name="budgetFlex"]').selectOption("10");
    await personal.locator('[name="extraBreaks"]').check();
    await personal.locator('[name="accompaniment"]').selectOption("guided");
    await personal.locator('[name="guideLanguage"]').selectOption("pt");
    await navigation.getByRole("button").nth(4).click();
    await page.getByTestId("brief-review").waitFor();
    assert.equal(submitted, undefined);
    await navigation.getByRole("button").nth(2).click();
    assert.ok(await personal.locator('[name="mustHave"][value="Museu e galeria"]').isChecked());
    assert.equal(await personal.locator('[name="budgetFlex"]').inputValue(), "10");
    await personal.locator('[name="accompaniment"]').selectOption("independent");
    assert.equal(await personal.locator('[name="guideLanguage"]').count(), 0);
    await navigation.getByRole("button").nth(4).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.locator('form button[type="submit"]').click();
    await page.locator("main").getByRole("alert").waitFor();
    assert.deepEqual(submitted.personalization.mustHave, ["Museu e galeria"]);
    assert.equal(submitted.personalization.guideLanguage, "");
    assert.equal(submitted.personalization.budgetFlex, 10);
    assert.equal(submitted.arrivalTime, "10:35");
    assert.equal(submitted.arrivalFlightNumber, "TP 1363");
    assert.equal(submitted.departureTime, "17:20");
    assert.equal(submitted.departureFlightNumber, "TP 1931");
    console.log(width, "briefing review, editing, conditional questions and payload OK");
    await page.close();
  }
} finally {
  await browser.close();
}
