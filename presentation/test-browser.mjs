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
    await page.locator('[data-tech-requirement="1"]').click();
    await page
      .getByRole("heading", { name: "Uma escolha com origem." })
      .waitFor();
    await page.getByRole("button", { name: "Revelar a arquitetura" }).click();
    await page.locator('[data-tech-node="3"]').click();
    await page
      .locator("#tech-node-detail")
      .getByRole("heading", { name: "Portal e domínio" })
      .waitFor();
    assert.equal(await page.locator(".tech-wires path").count(), 5);
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".tech-connection.is-active"))
            .animationName,
      ),
      "none",
    );
    await page.getByRole("button", { name: "Pausar animações" }).click();
    assert.equal(
      await page.locator("#experience").getAttribute("data-motion"),
      "off",
    );
    await page.getByRole("button", { name: "Ativar animações" }).click();
    await check();
    await page.getByRole("button", { name: "Seguir um dado" }).click();
    for (let step = 0; step < 3; step++)
      await page.getByRole("button", { name: "Avançar o dado" }).click();
    await page
      .getByRole("button", { name: "Simular falha na publicação" })
      .click();
    await page
      .getByRole("heading", { name: "A entrega anterior mantém-se." })
      .waitFor();
    assert.equal(
      await page.locator(".tech-preserved strong").innerText(),
      "Ativa no exemplo",
    );
    assert.equal(
      await page.locator(".tech-rejected strong").innerText(),
      "Não publicada",
    );
    await page.getByRole("button", { name: "Repor fluxo normal" }).click();
    await page.getByRole("button", { name: "Avançar o dado" }).click();
    assert.equal(
      await page.getByRole("button", { name: "Avançar o dado" }).isDisabled(),
      true,
    );
    await check();
    await page
      .getByRole("button", { name: "Distinguir o papel da IA" })
      .click();
    await page.locator('[data-tech-mechanism="1"]').click();
    await page
      .getByRole("heading", { name: "Um modelo com ferramentas." })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Examinar a evidência" }).click();
    await page.locator('[data-tech-proof="1"]').click();
    await page
      .getByRole("heading", {
        name: "Uma revisão antiga não sobrescreve a nova.",
      })
      .waitFor();
    await check();
    await page.getByRole("button", { name: "Entrar na experiência" }).click();
    assert.equal(
      await page.locator("#experience").getAttribute("data-part"),
      "experience",
    );
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
      await page.locator("#experience").getAttribute("data-part"),
      "technical",
    );
    await page.locator('[data-part="experience"]').click();
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
      "três partes, animações, falhas, percurso, teclado e isolamento OK",
    );
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  await page.goto(origin);
  for (const [chapter, file] of [
    ["01 Requisitos", "requirements"],
    ["02 Arquitetura e tecnologias", "architecture"],
    ["03 Dados e processos", "process"],
    ["04 O papel da IA", "ai"],
    ["05 Validação e limites", "validation"],
  ]) {
    await page.getByRole("button", { name: chapter }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `/tmp/blu-technical-${file}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "02 Arquitetura e tecnologias" })
    .click();
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".tech-connection.is-active"))
          .animationName,
    ),
    "tech-flow",
  );
  await page.getByRole("button", { name: "Pausar animações" }).click();
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".tech-connection.is-active"))
          .animationName,
    ),
    "none",
  );
  await page.getByRole("button", { name: "Ativar animações" }).click();
  await page.getByRole("button", { name: "03 Dados e processos" }).click();
  const before = await page.locator(".tech-record").boundingBox();
  await page.getByRole("button", { name: "Avançar o dado" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".tech-record")
      .getAnimations()
      .some((animation) => animation.playState === "running"),
  );
  await page
    .locator(".tech-record")
    .evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
  const after = await page.locator(".tech-record").boundingBox();
  assert.ok(
    after.x > before.x + 20,
    "O registo deve mover-se até à etapa seguinte",
  );
  await page.locator('[data-part="experience"]').click();
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
    await page.getByRole("button", { name: "Revelar a arquitetura" }).waitFor();
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
