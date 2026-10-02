import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  headless: true,
});
try {
  for (const width of [320, 1440])
    for (const locale of ["pt", "en", "es", "fr", "de", "zh"]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript(
        (locale) => localStorage.setItem("blu-portal-language", locale),
        locale,
      );
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
      await page.goto(process.env.PORTAL_URL ?? "http://127.0.0.1:3001");
      await page.waitForFunction(
        (locale) => document.documentElement.lang.startsWith(locale),
        locale,
      );
      for (const route of ["/catalog", "/exports", "/references", "/trash", "/"]) {
        const bar = page.getByTestId("top-bar");
        if (width < 1024) await bar.locator("details").first().locator("summary").click();
        await bar.locator("nav:visible").locator(`a[href="${route}"]`).click();
        await page.waitForURL((url) => url.pathname === route);
        if (width < 1024) {
          assert.equal(await bar.locator("nav:visible").count(), 0);
          await bar.locator("details").first().locator("summary").click();
        }
        assert.equal(
          await bar.locator('nav:visible a[aria-current="page"]').getAttribute("href"),
          route,
        );
        if (width < 1024) await bar.locator("details").first().locator("summary").click();
        await page.evaluate(() => {
          document.querySelectorAll("main").forEach((e) => (e.scrollTop = 1000));
          document.querySelector(
            '[data-testid="top-bar"]',
          ).parentElement.lastElementChild.scrollTop = 1000;
        });
        assert.equal(Math.round((await bar.boundingBox()).y), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      }
      console.log(width, locale, "navigation OK");
      await context.close();
    }
} finally {
  await browser.close();
}
