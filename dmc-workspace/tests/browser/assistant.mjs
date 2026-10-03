import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const snapshot = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
  Object.assign(snapshot.brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  snapshot.itinerary[0].items.forEach((a) => {
    a.isLocked = false;
    delete a.confirmation;
  });
  const count = snapshot.itinerary[0].items.length;
  await page.addInitScript((s) => {
    localStorage.setItem("blu-portal-language", "pt");
    localStorage.setItem(
      "blu-trips-v1",
      JSON.stringify([{ ...s, id: "assistant-browser", version: 1, messages: [] }]),
    );
  }, snapshot);
  let saved;
  await page.route("**/api/versions?*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/versions", (r) => {
    saved = r.request().postDataJSON();
    return r.fulfill({ json: { version: 2 } });
  });
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
  await page
    .locator("aside:visible button")
    .filter({ hasText: snapshot.brief.customerName })
    .click();
  await page
    .getByRole("button", { name: "Remover última atividade do dia 1", exact: true })
    .click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("blu-trips-v1"))[0].version === 2,
  );
  const trip = await page.evaluate(() => JSON.parse(localStorage.getItem("blu-trips-v1"))[0]);
  assert.equal(trip.itinerary[0].items.length, count - 1);
  assert.ok(
    trip.messages.at(-1).content?.includes("Removida") ||
      trip.messages.at(-1).text?.includes("Removida"),
  );
  assert.ok(saved);
  console.log("Assistant API → chat → saved version: OK");
} finally {
  await browser.close();
}
