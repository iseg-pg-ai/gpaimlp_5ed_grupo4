import assert from "node:assert/strict";
import { launchBrowser, readSnapshot } from "./helpers.mjs";
const base = (process.env.PORTAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const browser = await launchBrowser();
try {
  for (const width of [390, 1440])
    for (const locale of ["pt", "en", "es", "fr", "de", "zh"]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const snapshot = readSnapshot();
      Object.assign(snapshot.brief, {
        childrenAges: "",
        specialOccasion: "",
        notes: "",
        accommodation: "Boutique",
        diningPace: "Relaxed Dining (~90m)",
      });
      snapshot.itinerary[0].summary =
        "R01: até 2 sugestões; R03: início Standard (09:30). Horários propostos quando os dados permitem; intervalos estimados para deslocações e pausas. Itens por agendar requerem integração manual na agenda.";
      Object.assign(snapshot.itinerary[0].items[0], {
        source:
          "atracoes · cat-d1ff8096796527adc4a9c6d8b5781494 · revisão 2 · https://example.org/visitar",
        appliedRules: ["R04: prioridade por interesses"],
        pendingChecks: ["Confirmar acessibilidade"],
      });
      const original = JSON.stringify([
        { ...snapshot, id: "production-review", version: 1, messages: [] },
      ]);
      await page.addInitScript(
        ({ original, locale }) => {
          localStorage.setItem("blu-portal-language", locale);
          localStorage.setItem("blu-trips-v1", original);
        },
        { original, locale },
      );
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        if (path.endsWith("/api/translate"))
          return route.fulfill({
            json: { texts: request.postDataJSON().items.map((item) => item.text) },
          });
        if (path.endsWith("/api/versions")) return route.fulfill({ json: [] });
        if (path.endsWith("/api/weather"))
          return route.fulfill({
            json: { status: "unavailable", messagePt: "Indisponível", messageEn: "Unavailable" },
          });
        if (path.endsWith("/api/trash/cleanup"))
          return route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } });
        if (path.endsWith("/api/observatory"))
          return route.fulfill({ status: 503, json: { error: "Sem dados de teste." } });
        if (path.endsWith("/api/catalog"))
          return route.fulfill({
            json: [
              {
                id: "cat-d1ff8096796527adc4a9c6d8b5781494",
                revision: 2,
                category: "atracoes",
                status: "approved",
                published: true,
                fields: {
                  name: "Museu de teste",
                  location: "Lisboa",
                  description: "Uma visita cultural",
                  duration: "1 hora",
                  address: "",
                  price: "",
                  contacts: "",
                  accessibility: "",
                  source: "",
                  effort: "Por confirmar",
                  kind: "",
                  hours: "",
                  cuisine: "",
                  dietary: "",
                  provider: "",
                  modality: "",
                },
                raw: {},
                sourceData: {
                  id: "hidden-source-id",
                  _source_sheet: "HIDDEN-SHEET",
                  temas: ["Cultura", { id: "hidden-nested-id", descricao: "Apoio de mobilidade" }],
                },
                updatedAt: "2026-10-27T00:00:00Z",
                reason: "Revisão",
              },
            ],
          });
        return route.fulfill({ status: 503, json: { error: "Não usado neste ensaio." } });
      });
      await page.goto(base);
      await page.locator("main form").first().waitFor();
      assert.equal(await page.locator('header a[href$="/references"]').count(), 0);
      assert.doesNotMatch(await page.locator("main").innerText(), /\bR\d{2}\b|cat-[a-f0-9]{16}/);
      if (width < 1024) await page.locator('button[aria-controls="trip-navigation"]').click();
      await page
        .locator("aside:visible button")
        .filter({ hasText: snapshot.brief.customerName })
        .click();
      const card = page.getByTestId("activity-card").first();
      await card.waitFor();
      await card
        .locator("details")
        .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /\bR\d{2}\b|cat-[a-f0-9]{16}|intervalos estimados para deslocações/,
      );
      assert.match(await card.innerText(), /Confirmar acessibilidade/);
      assert.match(await card.innerText(), /example.org\/visitar/);
      assert.equal(await page.evaluate(() => localStorage.getItem("blu-trips-v1")), original);
      if (locale === "pt")
        await card.screenshot({ path: `/tmp/blu-production-review/activity-${width}.png` });
      await page.goto(`${base}/catalog`);
      await page.getByTestId("catalog-editor-view").click();
      await page.getByTestId("catalog-record").first().waitFor();
      assert.doesNotMatch(
        await page.getByTestId("catalog-record").first().innerText(),
        /cat-|· v2/,
      );
      if (locale === "pt")
        await page.screenshot({ path: `/tmp/blu-production-review/catalog-${width}.png` });
      await page.getByTestId("catalog-record").first().locator("button").first().click();
      const editor = page.getByTestId("catalog-editor");
      await editor.waitFor();
      await editor
        .locator("details")
        .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
      assert.match(await editor.innerText(), /Cultura/);
      assert.match(await editor.innerText(), /Apoio de mobilidade/);
      assert.doesNotMatch(
        await editor.innerText(),
        /hidden-source-id|hidden-nested-id|HIDDEN-SHEET/,
      );
      assert.deepEqual(errors, []);
      console.log(
        `${width}px ${locale}: regras e IDs ocultos; fontes e confirmações preservadas; snapshot inalterado.`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
