// Validação do pitch com browser real; o contacto externo é inspecionado, nunca enviado.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../dmc-workspace/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const origin = process.env.PRESENTATION_URL ?? "http://127.0.0.1:3003/";
const contact = new URL(
  JSON.parse(
    readFileSync(
      new URL("../frontend/website/data/channels.json", import.meta.url),
      "utf8",
    ),
  ).whatsappUrl,
);
const browser = await chromium.launch();
try {
  for (const width of [320, 768, 1440, 2560]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [],
      unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (
        request.url().startsWith("http") &&
        (new URL(request.url()).origin !== new URL(origin).origin ||
          request.url().includes("/api/"))
      )
        unexpected.push(request.url());
    });
    await page.goto(origin);
    const chapter = async (index) => {
      if (await page.locator("#chapter-select").isVisible())
        await page.locator("#chapter-select").selectOption(String(index));
      else await page.locator(".show-chapters button").nth(index).click();
    };
    const check = async () => {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Sem transbordo horizontal",
      );
      assert.equal(
        await page.locator('.show-chapters [aria-current="step"]').count(),
        1,
      );
      assert.equal(await page.locator(".show-chapters button").count(), 6);
      assert.match(await page.locator("#counter").innerText(), /\/ 06$/);
    };
    await page
      .getByRole("heading", { name: /Portugal, com intenção/ })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Pausar animações" }).click();
    assert.equal(
      await page.locator("#experience").getAttribute("data-motion"),
      "off",
    );
    await page.getByRole("button", { name: "Ativar animações" }).click();
    await page.locator("#next").click();
    await page.getByRole("button", { name: "Sabores & encontros" }).click();
    assert.equal(
      await page
        .locator('[data-preference="food"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#next").click();
    await page
      .getByRole("heading", { name: "A cidade também se prova" })
      .waitFor();
    const stop = page.getByRole("button", { name: "Explorar À mesa" });
    const bounds = await stop.boundingBox();
    assert.ok(
      bounds.width >= 44 && bounds.height >= 44,
      "Os pontos do mapa têm área de interação legível",
    );
    await stop.click();
    await page
      .locator("#place-detail")
      .getByRole("heading", { name: "À mesa", exact: true })
      .waitFor();
    await check();
    await chapter(3);
    const firstDay = await page.locator(".show-day").first().innerText();
    await page
      .getByRole("button", { name: "Experimentar uma tarde livre" })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Uma tarde só sua" }).waitFor();
    assert.equal(
      await page.locator(".show-day").first().innerText(),
      firstDay,
      "Alterar o dia 2 conserva o dia 1",
    );
    await page.locator("#previous").click();
    await page.locator("#next").click();
    await page.getByRole("heading", { name: "Uma tarde só sua" }).waitFor();
    await chapter(4);
    const document = page.locator(".show-document");
    await document
      .getByText("Experiência gastronómica", { exact: false })
      .waitFor();
    await document.getByText("Uma tarde só sua · tempo livre").waitFor();
    await document
      .getByText("PREÇO, DISPONIBILIDADE E CONDIÇÕES POR CONFIRMAR")
      .waitFor();
    await check();
    await chapter(5);
    const final = page.locator("#contact-final");
    const travellerHref = new URL(await final.getAttribute("href"));
    assert.equal(
      travellerHref.origin + travellerHref.pathname,
      contact.origin + contact.pathname,
    );
    assert.match(travellerHref.searchParams.get("text"), /viagem a Portugal/);
    assert.equal(await final.getAttribute("target"), "_blank");
    assert.ok((await final.getAttribute("rel")).includes("noopener"));
    await page
      .getByRole("button", { name: "Para parceiros", exact: true })
      .click();
    const partnerHref = new URL(await final.getAttribute("href"));
    assert.match(partnerHref.searchParams.get("text"), /possível parceria/);
    assert.equal(
      partnerHref.origin + partnerHref.pathname,
      contact.origin + contact.pathname,
    );
    assert.equal(
      await page
        .locator('[data-audience="partners"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .getByRole("link", { name: "Conversar sobre uma parceria" })
      .waitFor();
    await check();
    await page.locator("#next").click();
    await chapter(1);
    assert.equal(
      await page
        .locator('[data-preference="culture"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await chapter(3);
    await page
      .getByRole("heading", { name: "Uma descoberta por escolher" })
      .waitFor();
    await page.locator("#contact-jump").click();
    await page
      .getByRole("link", { name: "Falar sobre a minha viagem" })
      .waitFor();
    await page.evaluate(() => {
      document.documentElement.requestFullscreen = async () => {
        throw new Error("Bloqueado");
      };
    });
    await page
      .getByRole("button", { name: "Apresentar em ecrã inteiro" })
      .click();
    await page
      .getByText(
        "O navegador não permitiu ecrã inteiro. O pitch continua nesta janela.",
      )
      .waitFor();
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
    console.log(
      `${width}: seis momentos, escolhas, revisão, dois públicos e isolamento OK`,
    );
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(origin);
  for (const [index, name] of [
    "promise",
    "person",
    "destination",
    "curation",
    "proposal",
    "contact",
  ].entries()) {
    await page.locator(".show-chapters button").nth(index).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/blu-pitch-${name}.png` });
  }
  for (const path of [
    "/",
    "/codeeditor/default/ports/3003/",
    "/codeeditor/outro-workspace/ports/3003",
    "/codeeditor/outro-workspace/ports/3003/",
  ]) {
    await page.goto(new URL(path, origin).href);
    await page
      .getByRole("heading", { name: /Portugal, com intenção/ })
      .waitFor();
    assert.equal(
      await page
        .locator("#scene")
        .evaluate((node) => getComputedStyle(node).display),
      "grid",
    );
  }
  for (const path of ["serve.py", "../serve.py", "../.env", "missing.js"]) {
    const response = await page.request.get(new URL(path, origin).href);
    assert.equal(
      response.status(),
      404,
      "O servidor só expõe os recursos do pitch",
    );
  }
  await page.close();
} finally {
  await browser.close();
}
