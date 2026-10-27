import assert from "node:assert/strict";
import { launchBrowser, readSnapshot } from "./helpers.mjs";

const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    for (const scenario of ["success", "empty", "invalid", "failed"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(10000);

      const snapshot = readSnapshot();
      Object.assign(snapshot.brief, {
        childrenAges: "",
        specialOccasion: "",
        notes: "",
        accommodation: "Boutique",
        diningPace: "Relaxed Dining (~90m)",
      });
      const trip = { ...snapshot, id: "reopen-regression", version: 1, messages: [] };
      const original = JSON.stringify([trip]);
      await page.addInitScript((raw) => {
        localStorage.setItem("blu-portal-language", "pt");
        localStorage.setItem("blu-trips-v1", raw);
      }, original);
      const errors = [];
      const writes = [];
      let lists = 0;
      let requestedVersion;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.endsWith("/api/translate"))
          return route.fulfill({
            json: { texts: request.postDataJSON().items.map((i) => i.text) },
          });
        if (url.pathname.endsWith("/api/weather"))
          return route.fulfill({
            json: {
              status: "unavailable",
              messagePt: "Meteorologia indisponível",
              messageEn: "Weather unavailable",
            },
          });
        if (!url.pathname.endsWith("/api/versions"))
          return route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } });
        if (request.method() !== "GET") writes.push(request.method());
        if (!url.searchParams.has("version")) {
          lists++;
          // O histórico inicial está vazio; o clique tem de voltar a consultar o servidor.
          if (lists === 1 || scenario === "empty") return route.fulfill({ json: [] });
          if (scenario === "failed")
            return route.fulfill({ status: 503, json: { error: "Histórico indisponível." } });
          return route.fulfill({
            json: [1, 3, 2].map((version) => ({
              version,
              filename: "teste.pdf",
              createdAt: "2026-10-01T12:00:00Z",
            })),
          });
        }
        requestedVersion = url.searchParams.get("version");
        await new Promise((resolve) => setTimeout(resolve, 250));
        const saved = structuredClone(snapshot);
        saved.itinerary[0].title = "Dia recuperado do servidor";
        return route.fulfill({
          json: {
            snapshot: scenario === "invalid" ? { itinerary: [null] } : saved,
            meta: { version: 3 },
          },
        });
      });
      await page.goto(process.env.PORTAL_URL ?? "http://127.0.0.1:3001");

      if (width < 1024)
        await page.getByRole("button", { name: /Viagens recentes|Recent Journeys/i }).click();

      await page
        .locator("aside:visible button")
        .filter({ hasText: snapshot.brief.customerName })
        .click();

      const tools = page.getByTestId("proposal-tools");
      await tools.locator("summary").first().click();
      await page.getByText("Versões guardadas ·", { exact: false }).click();

      await page.getByRole("button", { name: "Reabrir última versão guardada" }).click();
      if (scenario === "success") {
        await page.getByRole("status").filter({ hasText: "Versão reaberta: v003" }).waitFor();
        assert.equal(requestedVersion, "3");
        const stored = JSON.parse(
          await page.evaluate(() => localStorage.getItem("blu-trips-v1")),
        )[0];
        assert.equal(stored.version, 3);
        assert.equal(stored.itinerary[0].title, "Dia recuperado do servidor");
        assert.equal(stored.id, trip.id);
        assert.deepEqual(stored.messages, []);
        await page.screenshot({ path: `/tmp/blu-reopen-${width}.png`, fullPage: true });
      } else {
        await page.locator('p[role="alert"]').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem("blu-trips-v1")), original);
      }
      assert.ok(lists >= 2);
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      console.log(`${width}px ${scenario}: OK`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
