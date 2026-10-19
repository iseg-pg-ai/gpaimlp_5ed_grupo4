import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
const require = createRequire(new URL("../dmc-workspace/package.json", import.meta.url));
const { chromium } = require("playwright");
const fixture = spawn("python", ["-B", "-m", "monitoring.browser_fixture"], { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "inherit"] });
let browser;
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture não arrancou")), 10000);
    fixture.once("exit", () => { clearTimeout(timer); reject(new Error("Fixture terminou")); });
    createInterface({ input: fixture.stdout }).once("line", (line) => { clearTimeout(timer); resolve(JSON.parse(line).url); });
  });
  browser = await chromium.launch();
  for (const width of [320, 768, 1440, 2560]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (!request.url().startsWith(new URL(origin).origin)) external.push(request.url()); });
    assert.equal((await context.request.get(origin + "api/status")).status(), 401);
    await page.goto(origin);
    await page.getByRole("heading", { name: "Conhecer o estado. Antecipar a falha." }).waitFor();
    const checkWidth = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Transbordo em ${width}`);
    await checkWidth();
    await page.getByLabel("Utilizador").fill("operator");
    await page.getByLabel("Palavra-passe").fill("invalid-password");
    await page.getByRole("button", { name: "Entrar no centro de operações" }).click();
    await page.getByText("Credenciais inválidas.", { exact: true }).waitFor();
    await page.getByLabel("Utilizador").fill("operator");
    await page.getByLabel("Palavra-passe").fill("fixture-only-long-password");
    await page.getByRole("button", { name: "Entrar no centro de operações" }).click();
    await page.getByRole("heading", { name: "O sistema, à vista." }).waitFor();
    await page.locator("#service-count").getByText("2 / 3").waitFor();
    assert.equal(await page.locator("#incident-count").innerText(), "1");
    assert.equal(await page.locator(".service-card").count(), 4);
    assert.equal(await page.locator("#freshness").innerText(), "Cadência por definir");
    assert.equal(await page.locator(".chart .bar").count(), 24);
    assert.ok(await page.locator(".chart .bar").first().evaluate((bar) => bar.getBoundingClientRect().height > 20));
    await checkWidth();
    if (width === 320) {
      const payload = await (await context.request.get(origin + "api/status")).json();
      payload.snapshot.checked_at = "2020-01-01T00:00:00Z";
      await page.route("**/api/status", (route) => route.fulfill({ json: payload }));
      await page.getByRole("button", { name: "Atualizar" }).click();
      await page.getByText("Recolha atrasada", { exact: true }).waitFor();
      await page.unroute("**/api/status");
      await page.getByRole("button", { name: "Atualizar" }).click();
      await page.getByText("Recolha ativa", { exact: true }).waitFor();
    }
    if (width === 1440 || width === 320) await page.screenshot({ path: `/tmp/blu-monitoring-${width}.png`, fullPage: true });
    await page.route("**/api/status", (route) => route.abort());
    await page.getByRole("button", { name: "Atualizar" }).click();
    await page.getByText("Não foi possível atualizar.", { exact: false }).waitFor();
    await page.unroute("**/api/status");
    await page.getByRole("button", { name: "Terminar sessão" }).click();
    await page.getByLabel("Utilizador").waitFor();
    assert.equal((await context.request.get(origin + "api/status")).status(), 401);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(`${width}: login, bloqueio API, dados, falha de ligação, logout e responsividade OK`);
    await context.close();
  }
} finally {
  await browser?.close();
  fixture.kill();
}
