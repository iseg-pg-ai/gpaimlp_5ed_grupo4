/* Cenas completas e passos laterais, sem deslocação vertical ou cortes. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../dmc-workspace/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const origin = process.env.PRESENTATION_URL ?? "http://127.0.0.1:3003/";
const browser = await chromium.launch();
const settled = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function check(page) {
  const metrics = await page.evaluate(() => {
    const scene = document.querySelector("#scene"),
      frame = document.querySelector("#scene-window"),
      footer = document.querySelector(".show-footer").getBoundingClientRect();
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      vw: innerWidth,
      vh: innerHeight,
      content: scene.scrollHeight,
      available: frame.clientHeight,
      footer: footer.bottom,
      scroll: scrollY,
      font: parseFloat(getComputedStyle(scene.querySelector("p")).fontSize),
    };
  });
  assert.ok(
    metrics.width <= metrics.vw,
    `Transbordo horizontal: ${JSON.stringify(metrics)}`,
  );
  assert.ok(
    metrics.height <= metrics.vh,
    `Transbordo vertical: ${JSON.stringify(metrics)}`,
  );
  assert.ok(
    metrics.content <= metrics.available + 2,
    `Conteúdo cortado: ${JSON.stringify(metrics)}`,
  );
  assert.ok(metrics.footer <= metrics.vh + 1);
  assert.equal(metrics.scroll, 0);
  assert.ok(metrics.font >= 14, "O texto de leitura mantém pelo menos 14 px.");
}
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [844, 390],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    for (let index = 0; index < 12; index++) {
      if (await page.locator("#chapter-select").isVisible()) {
        await page.locator("#chapter-select").selectOption(String(index));
      } else {
        if (index === 0 || index === 6)
          await page
            .locator(
              `.show-parts [data-part="${index < 6 ? "technical" : "experience"}"]`,
            )
            .click();
        await page
          .locator(".show-chapters button")
          .nth(index % 6)
          .click();
      }
      await settled(page);
      for (let step = 0; step < 40; step++) {
        await check(page);
        if (await page.locator("#content-next").isDisabled()) break;
        assert.ok(step < 39, "O capítulo tem um número finito de passos.");
        await page.locator("#content-next").click();
        await settled(page);
      }
      await page.mouse.wheel(0, 500);
      assert.equal(await page.evaluate(() => scrollY), 0);
    }
    assert.deepEqual(errors, []);
    console.log(
      `${width} × ${height}: 12 capítulos e todos os passos sem cortes nem deslocação vertical.`,
    );
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await page.goto(origin);
  await page.locator(".show-parts [data-part='experience']").click();
  await page.locator(".show-chapters button").nth(2).click();
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await settled(page);
  assert.equal(
    await page
      .getByRole("button", { name: "Signature", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await check(page);
  while (!(await page.locator("#content-previous").isDisabled()))
    await page.locator("#content-previous").click();
  await page.locator("#show-title").focus();
  const title = await page.locator("#show-title").innerText();
  await page.keyboard.press("ArrowRight");
  assert.match(
    await page.locator("#content-counter").innerText(),
    /^Passo 2 de/,
  );
  assert.equal(await page.locator("#show-title").innerText(), title);
  await page.keyboard.press("ArrowLeft");
  await page.screenshot({ path: "/tmp/blu-viewport-proposal-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page);
  await page.screenshot({ path: "/tmp/blu-viewport-proposal-mobile.png" });
  await page.close();
} finally {
  await browser.close();
}
