// Helpers de navegador para reutilizar preparação, navegação e verificações dos cenários do
// portal.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

export function launchBrowser() {
  return chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
}

export function readSnapshot() {
  return JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
}

export function mockTranslation(page) {
  return page.route("**/api/translate", (route) =>
    route.fulfill({
      json: {
        texts: route
          .request()
          .postDataJSON()
          .items.map((item) => item.text),
      },
    }),
  );
}
