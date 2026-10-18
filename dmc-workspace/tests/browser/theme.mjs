import assert from "node:assert/strict";
import { launchBrowser, mockTranslation } from "./helpers.mjs";

const portal = process.env.PORTAL_URL ?? "http://127.0.0.1:3001";
const browser = await launchBrowser();

async function checkContrast(locator) {
  const ratio = await locator.evaluate(async (node) => {
    // Medir depois da transição de cores dos controlos.
    getComputedStyle(node).color;
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
    const rgb = (value) => value.match(/[\d.]+/g).map(Number);
    const luminance = (channels) =>
      channels
        .slice(0, 3)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    let parent = node;
    let background;
    while (parent) {
      const channels = rgb(getComputedStyle(parent).backgroundColor);
      if (channels.length === 3 || channels[3] === 1) {
        background = luminance(channels);
        break;
      }
      parent = parent.parentElement;
    }
    const foreground = luminance(rgb(getComputedStyle(node).color));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  assert.ok(ratio >= 4.5, `Contraste insuficiente: ${ratio}`);
}
try {
  for (const width of [320, 768, 1440, 2560]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await mockTranslation(page);
    await page.goto(portal);
    const theme = () => page.locator("html").getAttribute("data-theme");
    await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).waitFor();
    assert.equal(await theme(), "light", "O tema padrão deve continuar claro");
    const lightColor = await page.locator("body").evaluate((node) => getComputedStyle(node).color);
    await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).click();
    assert.equal(await theme(), "dark");
    assert.notEqual(
      await page.locator("body").evaluate((node) => getComputedStyle(node).color),
      lightColor,
    );
    await checkContrast(page.locator("body"));
    await checkContrast(page.locator(".brief-screen input").first());
    await checkContrast(page.locator(".theme-toggle"));
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page.locator("body").evaluate((node) => getComputedStyle(node).color),
      lightColor,
    );
    await page.emulateMedia({ media: "screen" });
    for (const route of ["catalog", "exports", "references", "trash", ""]) {
      await page.goto(`${portal.replace(/\/$/, "")}/${route}`);
      await page.getByRole("button", { name: "Ativar tema claro", exact: true }).waitFor();
      assert.equal(await theme(), "dark");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      const control = page.locator(".theme-toggle");
      const box = await control.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
    await page.reload();
    await page.getByRole("button", { name: "Ativar tema claro", exact: true }).waitFor();
    assert.equal(await theme(), "dark");
    const second = await context.newPage();
    await mockTranslation(second);
    await second.goto(portal);
    await second.getByRole("button", { name: "Ativar tema claro", exact: true }).waitFor();
    await page.getByRole("button", { name: "Ativar tema claro", exact: true }).focus();
    await page.keyboard.press("Enter");
    await second.getByRole("button", { name: "Ativar tema escuro", exact: true }).waitFor();
    assert.equal(await theme(), "light");
    assert.equal(await second.locator("html").getAttribute("data-theme"), "light");
    await context.close();
    console.log(width, "temas, persistência, navegação, teclado e sincronização OK");
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await mockTranslation(page);
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "blu-portal-theme") throw new Error("Armazenamento bloqueado");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "blu-portal-theme") throw new Error("Armazenamento bloqueado");
      return setItem.call(this, key, value);
    };
  });
  await page.goto(portal);
  await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).click();
  await page.getByRole("button", { name: "Ativar tema claro", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await context.close();
  console.log("Armazenamento bloqueado OK");
} finally {
  await browser.close();
}
