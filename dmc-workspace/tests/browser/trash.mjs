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
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  const trip = { ...snapshot, id: "trash-browser", version: 1, messages: [] };
  await page.addInitScript((saved) => {
    localStorage.setItem("blu-portal-language", "pt");
    localStorage.setItem("blu-trips-v1", JSON.stringify([saved]));
  }, trip);
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
  await page.route("**/api/versions?*", (route) => route.fulfill({ json: [] }));
  let restoredVersion = false;
  await page.route("**/api/versions/trash", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: [
          {
            tripId: "trash-browser",
            version: 1,
            filename: "BLU_Cliente_Lisboa_v001.pdf",
            trashedAt: "2026-10-05T10:00:00Z",
            trashReason: "manual",
          },
        ],
      });
    restoredVersion = route.request().postDataJSON().action === "restore";
    return route.fulfill({ json: { version: 1 } });
  });

  const portalUrl = process.env.PORTAL_URL || "http://localhost:3001";
  await page.goto(portalUrl);
  const trashButton = page
    .locator('button[title="Enviar viagem para o Lixo"]')
    .filter({ visible: true });
  await trashButton.waitFor({ timeout: 5000 });
  await trashButton.click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("blu-trips-v1")).length),
    0,
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("blu-trip-trash-v1"))[0].removal),
    "manual",
  );

  await page.goto(portalUrl + "/trash");
  await page.getByRole("heading", { name: "Viagens removidas" }).waitFor();
  await page.getByRole("button", { name: "Restaurar viagem" }).click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("blu-trips-v1")).length),
    1,
  );
  await page.getByRole("button", { name: "Restaurar versão" }).click();
  await page.waitForFunction(
    () => !document.body.innerText.includes("BLU_Cliente_Lisboa_v001.pdf"),
  );
  assert.equal(restoredVersion, true);
  console.log("Trip trash → restore and version restore: OK");
} finally {
  await browser.close();
}
