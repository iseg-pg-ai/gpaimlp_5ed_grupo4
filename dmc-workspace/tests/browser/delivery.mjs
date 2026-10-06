import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snapshot = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
  Object.assign(snapshot.brief, {
    customerEmail: "cliente@example.com",
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  await page.addInitScript((trip) => {
    localStorage.setItem("blu-portal-language", "pt");
    localStorage.setItem(
      "blu-trips-v1",
      JSON.stringify([{ ...trip, id: "delivery-browser", version: 3, messages: [] }]),
    );
  }, snapshot);
  await page.route("**/api/translate", (route) =>
    route.fulfill({
      json: {
        texts: route
          .request()
          .postDataJSON()
          .items.map((item) => item.text),
      },
    }),
  );
  await page.route("**/api/trash/cleanup", (route) =>
    route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } }),
  );
  await page.route("**/api/versions?*", (route) =>
    route.fulfill({
      json: [
        { version: 3, createdAt: "2026-10-05T12:00:00Z", filename: "v003.pdf" },
        { version: 2, createdAt: "2026-10-04T12:00:00Z", filename: "v002.pdf" },
      ],
    }),
  );
  let shared;
  await page.route("**/api/shares", (route) => {
    shared = route.request().postDataJSON();
    return route.fulfill({
      json: { shareUrl: "https://example.test/share/token", recipient: shared.recipient },
    });
  });
  await page.goto(process.env.PORTAL_URL || "http://localhost:3001");
  const tripButton = page
    .locator("aside:visible button")
    .filter({ hasText: snapshot.brief.customerName });
  await tripButton.waitFor();
  await tripButton.click();
  await page.getByRole("button", { name: /Partilhar/i }).click();
  const dialog = page.getByRole("dialog", { name: /Partilhar proposta/i });
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel(/Email do destinatário/i).inputValue(),
    "cliente@example.com",
  );
  await dialog.getByLabel(/Versão/i).selectOption("2");
  await dialog.locator("summary").filter({ hasText: "English" }).click();
  await dialog.getByRole("button", { name: /Português/ }).click();
  await dialog.getByText("Documento PDF", { exact: true }).click();
  await dialog.getByRole("button", { name: /Preparar email/i }).click();
  await dialog.getByRole("status").waitFor();
  assert.deepEqual(shared, {
    tripId: "delivery-browser",
    version: 2,
    locale: "pt",
    method: "document",
    recipient: "cliente@example.com",
  });
  console.log("Delivery: email, version, language, PDF sharing and success feedback OK");
} finally {
  await browser.close();
}
