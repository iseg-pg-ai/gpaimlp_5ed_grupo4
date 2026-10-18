import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../dmc-workspace/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const origin =
  process.env.PRESENTATION_URL ??
  "http://127.0.0.1:3003/codeeditor/default/ports/3003/";
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
        (!request.url().startsWith(new URL(origin).origin + "/") ||
          request.url().includes("/api/"))
      )
        unexpected.push(request.url());
    });
    await page.goto(origin);
    const check = async () => {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Transbordo horizontal",
      );
      assert.equal(
        await page.locator('.show-chapters [aria-current="step"]').count(),
        1,
      );
    };
    await check();
    await page.getByRole("button", { name: "Sabores & encontros" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Sabores & encontros" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Explorar o território" }).click();
    await page
      .getByRole("heading", { name: "A cidade também se prova" })
      .waitFor();
    await check();
    if (width === 320)
      await page.screenshot({
        path: "/tmp/blu-presentation-mobile.png",
        fullPage: true,
      });
    const bounds = await page
      .getByRole("button", { name: "Explorar À mesa" })
      .boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    await page.getByRole("button", { name: "Explorar À mesa" }).click();
    await page
      .locator("#place-detail")
      .getByRole("heading", { name: "À mesa", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Explorar À mesa" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.keyboard.press("ArrowRight");
    await page
      .getByRole("heading", { name: "Experiência gastronómica" })
      .waitFor();
    assert.equal(
      await page
        .locator("#show-title")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await check();
    const unchanged = await page.locator(".show-day").first().innerText();
    await page.getByRole("button", { name: "Reservar a tarde livre" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Uma tarde só sua" }).waitFor();
    assert.equal(
      await page.locator(".show-day").first().innerText(),
      unchanged,
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("heading", { name: "Uma tarde só sua" }).waitFor();
    await page.getByRole("button", { name: "Repor a experiência" }).click();
    await page
      .getByRole("heading", { name: "Uma experiência por escolher" })
      .waitFor();
    await page.getByRole("button", { name: "Seguir a origem" }).click();
    await page
      .getByRole("button", { name: "03 ENTREGA / WAREHOUSE Publicação" })
      .click();
    await page
      .getByRole("heading", { name: "Uma entrega coerente para consultar." })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Conhecer a colaboração" }).click();
    await page
      .getByRole("button", { name: "Remover uma atividade protegida" })
      .click();
    await page
      .getByRole("heading", { name: "A atividade protegida mantém-se." })
      .waitFor();
    await page.getByRole("button", { name: "03 A proposta" }).click();
    await page
      .getByRole("heading", { name: "Uma experiência por escolher" })
      .waitFor();
    await page.getByRole("button", { name: "05 A colaboração" }).click();
    await page
      .getByRole("button", { name: "Reservar uma tarde livre" })
      .click();
    await page
      .getByRole("heading", { name: "Uma tarde livre no dia 2." })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Preparar a entrega" }).click();
    await page
      .locator("#document-preview")
      .getByText("Uma tarde só sua · tempo livre reservado")
      .waitFor();
    await page
      .locator("#document-preview")
      .getByText("Experiência gastronómica", { exact: false })
      .waitFor();
    await page.getByRole("button", { name: "01 / Exemplo inicial" }).click();
    await page
      .locator("#document-preview")
      .getByText("Visita cultural", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .locator("#document-preview")
        .getByText("Uma tarde só sua · tempo livre reservado")
        .count(),
      0,
    );
    await page.getByRole("button", { name: "02 / As suas escolhas" }).click();
    await page
      .locator("#document-preview")
      .getByText("Uma tarde só sua · tempo livre reservado")
      .waitFor();
    await check();
    await page
      .getByRole("button", { name: "Ver o sistema por dentro" })
      .click();
    await page
      .getByRole("button", { name: "ASSISTÊNCIA Agente opcional" })
      .click();
    await page
      .locator("#layer-detail")
      .getByRole("heading", { name: "Agente opcional" })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Dar o próximo passo" }).click();
    const finalLink = page.getByRole("link", {
      name: "Explorar o Observatório real",
    });
    assert.equal(
      await finalLink.getAttribute("href"),
      "https://ai5qwwdt6siuxug.studio.eu-west-1.sagemaker.aws/codeeditor/default/ports/3001/catalog",
    );
    assert.equal(await finalLink.getAttribute("target"), "_blank");
    assert.ok((await finalLink.getAttribute("rel")).includes("noopener"));
    await page
      .getByText("Uma tarde livre reservada", { exact: true })
      .waitFor();
    await page.keyboard.press("ArrowRight");
    await finalLink.waitFor();
    await check();
    if (width === 320)
      await page.screenshot({
        path: "/tmp/blu-presentation-final-mobile.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "Recomeçar" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Cultura & património" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "03 A proposta" }).click();
    await page.getByRole("heading", { name: "Visita cultural" }).waitFor();
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
        "O navegador não permitiu ecrã inteiro. A apresentação continua nesta janela.",
      )
      .waitFor();
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
    console.log(
      width,
      "percurso, escolha, mapa, roteiro, teclado, restauro e isolamento OK",
    );
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  await page.goto(origin);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/blu-presentation-request.png" });
  await page.getByRole("button", { name: "Explorar o território" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/blu-presentation-map.png" });
  await page.getByRole("button", { name: "Dar forma à viagem" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "/tmp/blu-presentation-plan.png",
    fullPage: true,
  });
  for (const [chapter, file] of [
    ["04 Os dados", "data"],
    ["05 A colaboração", "collaboration"],
    ["06 A entrega", "delivery"],
    ["07 Por dentro", "architecture"],
    ["08 O próximo passo", "final"],
  ]) {
    await page.getByRole("button", { name: chapter }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `/tmp/blu-presentation-${file}.png`,
      fullPage: true,
    });
  }
  for (const address of [
    origin.replace(/\/$/, ""),
    new URL("/", origin).href,
  ]) {
    await page.goto(address);
    await page.getByRole("button", { name: "Explorar o território" }).waitFor();
    assert.equal(
      await page
        .locator("#scene")
        .evaluate((node) => getComputedStyle(node).display),
      "grid",
    );
  }
  const response = await page.request.get(new URL("serve.py", origin).href);
  assert.equal(response.status(), 404, "O servidor deve expor apenas dist/");
  await page.close();
} finally {
  await browser.close();
}
