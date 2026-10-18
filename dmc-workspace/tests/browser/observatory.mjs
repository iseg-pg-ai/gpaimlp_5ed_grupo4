import assert from "node:assert/strict";
import { launchBrowser, mockTranslation } from "./helpers.mjs";
const portal = (process.env.PORTAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const titles = [
  "Um território de possibilidades.",
  "Encontre a próxima descoberta.",
  "Um destino, muitas perspetivas.",
  "Cada preço tem um contexto.",
  "Conhecimento que merece continuar.",
  "Saber o que ainda não sabemos.",
];
const areas = ["Panorama", "Explorar oferta", "Destinos", "Preços", "Histórico", "Qualidade"];
const browser = await launchBrowser();
try {
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await mockTranslation(page);
    await page.goto(`${portal}/catalog`);
    const dashboard = page.getByTestId("native-observatory");
    await page.getByRole("heading", { name: titles[0], exact: true }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.locator(".obs-map-label").first().waitFor();
    const overlaps = await page.locator(".obs-map-canvas > svg").evaluate((svg) => {
      const markers = [...svg.querySelectorAll(".obs-map-dot")].map((node) =>
        node.getBoundingClientRect(),
      );
      return [...svg.querySelectorAll(".obs-map-label")].some((node) => {
        const label = node.getBoundingClientRect();
        return markers.some((marker) => {
          const x = marker.x + marker.width / 2,
            y = marker.y + marker.height / 2;
          return (
            Math.hypot(
              x - Math.max(label.left, Math.min(x, label.right)),
              y - Math.max(label.top, Math.min(y, label.bottom)),
            ) <
            marker.width / 2
          );
        });
      });
    });
    assert.equal(overlaps, false, "As etiquetas não podem tapar os marcadores");
    for (let i = 0; i < areas.length; i++) {
      await dashboard.getByRole("button", { name: new RegExp(`^0${i + 1} ${areas[i]}$`) }).click();
      await page.getByRole("heading", { name: titles[i], exact: true }).waitFor();
      if (width >= 1024 && i <= 2) {
        const panels = await page
          .locator(".obs-two-columns > section")
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
        assert.equal(panels.length, 2);
        assert.ok(Math.abs(panels[0] - panels[1]) < 2, `Alturas desalinhadas: ${panels}`);
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await dashboard.getByRole("button", { name: "02 Explorar oferta", exact: true }).click();
    const search = page.getByLabel("Pesquisar oferta", { exact: true });
    await search.fill("sem-correspondência-987654321");
    await page
      .getByText("Nenhum resultado. Retire um filtro para continuar.", { exact: true })
      .waitFor();
    await search.fill("");
    await page.getByLabel("Destino harmonizado", { exact: true }).selectOption("Lisboa");
    const refreshed = page.waitForResponse(
      (response) => response.url().endsWith("/api/observatory") && response.status() === 200,
    );
    await page.getByRole("button", { name: "Atualizar análise", exact: true }).click();
    await refreshed;
    await page.getByRole("button", { name: "Atualizar análise", exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Destino harmonizado", { exact: true }).inputValue(),
      "Lisboa",
    );
    const cards = page.locator(".obs-record-list article");
    assert.ok((await cards.count()) > 1);
    await cards.nth(0).locator('input[type="checkbox"]').check();
    await cards.nth(1).locator('input[type="checkbox"]').check();
    await page.getByRole("heading", { name: "Comparar oferta · 2/4", exact: true }).waitFor();
    await cards.first().locator(".obs-record-open").click();
    await page.getByRole("region", { name: "Ficha da oferta", exact: true }).waitFor();
    await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
    const svg = page.getByRole("group", { name: "Mapa interativo da oferta", exact: true });
    const before = await svg.getAttribute("viewBox");
    const hitBefore = await svg.locator('circle[role="button"]').first().boundingBox();
    assert.ok(hitBefore && hitBefore.width >= 43 && hitBefore.height >= 43);

    await page.getByRole("button", { name: "Aproximar mapa", exact: true }).click();
    assert.notEqual(await svg.getAttribute("viewBox"), before);
    const point = svg.locator('circle[role="button"]').first();
    const hitAfter = await point.boundingBox();
    assert.ok(hitAfter && hitAfter.width >= 43 && hitAfter.height >= 43);
    assert.ok(Math.abs(hitAfter.width - hitBefore.width) < 1);
    await point.focus();
    await page.locator(".obs-map-tooltip").waitFor();
    await point.press("Enter");
    await page.getByRole("region", { name: "Ficha da oferta", exact: true }).waitFor();
    await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
    await page.getByLabel("Agrupar próximos", { exact: true }).check();
    await page.getByRole("button", { name: "Repor mapa", exact: true }).click();
    await page.getByRole("button", { name: "01 Panorama", exact: true }).click();
    await page.screenshot({ path: `/tmp/blu-native-observatory-${width}.png` });
    assert.ok(!requests.some((url) => url.includes(":8501")));
    assert.deepEqual(errors, []);
    console.log(width, "seis áreas, filtros, comparação, ficha e mapa nativo OK");
    await page.close();
  }
  const page = await browser.newPage();
  await mockTranslation(page);
  let healthy = false;
  await page.route("**/api/observatory", (route) =>
    healthy ? route.continue() : route.fulfill({ status: 503, json: { error: "Indisponível" } }),
  );
  await page.route("**/api/catalog", (route) => route.fulfill({ json: [] }));
  await page.goto(`${portal}/catalog`);
  await page.getByRole("heading", { name: "Observatório indisponível", exact: true }).waitFor();
  await page.getByTestId("catalog-editor-view").click();
  await page.getByRole("button", { name: "+ Novo Registo", exact: true }).click();
  const name = page.getByTestId("catalog-editor").locator('[name="name"]');
  await name.fill("Rascunho preservado");
  await page.getByTestId("catalog-observatory-view").click();
  healthy = true;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await page.getByRole("heading", { name: titles[0], exact: true }).waitFor();
  await page.getByTestId("catalog-editor-view").click();
  assert.equal(await name.inputValue(), "Rascunho preservado");
  await page.close();
  console.log("Falha, recuperação e preservação do editor OK, sem guardar dados");
} finally {
  await browser.close();
}
