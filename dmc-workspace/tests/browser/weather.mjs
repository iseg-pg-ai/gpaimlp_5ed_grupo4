import assert from "node:assert/strict";
import { launchBrowser, mockTranslation, readSnapshot } from "./helpers.mjs";
const browser = await launchBrowser();
const portal = process.env.PORTAL_URL ?? "http://localhost:3001";
try {
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await mockTranslation(page);
    const external = [];
    await page.route("**/*open-meteo.com/**", (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    await page.route("**/api/weather", (route) => {
      const { date } = route.request().postDataJSON();
      return route.fulfill({
        json: {
          status: "available",
          weather: {
            date,
            weatherCode: 2,
            conditionPt: "Parcialmente nublado",
            conditionEn: "Partly cloudy",
            icon: "⛅",
            maxTemp: 24,
            minTemp: 16,
            ...(date.endsWith("11") ? {} : { precipitationProbability: 10 }),
            isRainy: false,
            isHistorical: false,
            latitude: 38.7223,
            longitude: -9.1393,
            sourceUrl: "https://api.open-meteo.com/v1/forecast",
          },
        },
      });
    });
    const snapshot = readSnapshot();
    Object.assign(snapshot.brief, {
      customerName: "Teste meteorologia",
      childrenAges: "",
      specialOccasion: "",
      notes: "",
      accommodation: "Boutique",
      diningPace: "Relaxed Dining (~90m)",
    });
    snapshot.itinerary.push({
      ...structuredClone(snapshot.itinerary[0]),
      dayNumber: 2,
      date: "2026-10-11",
    });
    await page.addInitScript((snapshot) => {
      localStorage.setItem("blu-portal-language", "pt");
      localStorage.setItem(
        "blu-trips-v1",
        JSON.stringify([{ ...snapshot, id: "weather-html", messages: [] }]),
      );
    }, snapshot);
    await page.goto(portal);
    if (width < 1024) await page.locator('button[aria-controls="trip-navigation"]').click();
    await page.locator("aside:visible button").filter({ hasText: "Teste meteorologia" }).click();
    const badges = page.getByTestId("day-weather");
    await badges.first().waitFor();
    assert.ok((await badges.count()) >= 2);
    const firstId = await badges.first().getAttribute("popovertarget");
    const secondId = await badges.nth(1).getAttribute("popovertarget");
    assert.notEqual(firstId, secondId);
    await badges.first().click();
    let dialog = page.locator("[popover]:popover-open");
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("heading", { name: "Parcialmente nublado" }).waitFor();
    const bounds = await dialog.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= 900,
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await badges.first().click();
    await page.mouse.click(2, 2);
    await dialog.waitFor({ state: "hidden" });
    await badges.first().click();
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await badges.nth(1).scrollIntoViewIfNeeded();
    await badges.nth(1).click();
    assert.equal(await page.locator("[popover]:popover-open").getAttribute("id"), secondId);
    await page.keyboard.press("Escape");
    assert.deepEqual(external, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    console.log(
      width,
      "local weather API; native popover, Escape, outside click, close button and distinct IDs OK",
    );
    await page.close();
  }
} finally {
  await browser.close();
}
