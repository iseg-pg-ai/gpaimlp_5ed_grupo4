import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
const require = createRequire(
  new URL("../dmc-workspace/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const fixture = spawn("python", ["-B", "-m", "monitoring.browser_fixture"], {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture não arrancou")),
      10000,
    );
    fixture.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Fixture terminou"));
    });
    createInterface({ input: fixture.stdout }).once("line", (line) => {
      clearTimeout(timer);
      resolve(JSON.parse(line).url);
    });
  });
  browser = await chromium.launch();
  for (const width of [320, 768, 1440, 2560]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (!request.url().startsWith(new URL(origin).origin))
        external.push(request.url());
    });
    assert.equal(
      (await context.request.get(origin + "api/status")).status(),
      401,
    );
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "Conhecer o estado. Antecipar a falha." })
      .waitFor();
    const checkWidth = async () =>
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Transbordo em ${width}`,
      );
    await checkWidth();
    await page.getByLabel("Utilizador").fill("operator");
    await page.getByLabel("Palavra-passe").fill("invalid-password");
    await page
      .getByRole("button", { name: "Entrar no centro de operações" })
      .click();
    await page.getByText("Credenciais inválidas.", { exact: true }).waitFor();
    await page.getByLabel("Utilizador").fill("operator");
    await page.getByLabel("Palavra-passe").fill("fixture-only-long-password");
    await page
      .getByRole("button", { name: "Entrar no centro de operações" })
      .click();
    await page.getByRole("heading", { name: "O sistema, à vista." }).waitFor();
    await page.locator("#service-count").getByText("2 / 3").waitFor();
    assert.equal(await page.locator("#incident-count").innerText(), "1");
    assert.equal(await page.locator(".service-card").count(), 4);
    assert.equal(
      await page.locator("#freshness").innerText(),
      "Cadência por definir",
    );
    assert.equal(await page.locator(".chart .bar").count(), 24);
    assert.ok(
      await page
        .locator(".chart .bar")
        .first()
        .evaluate((bar) => bar.getBoundingClientRect().height > 20),
    );
    await checkWidth();
    if (width === 320) {
      const payload = await (
        await context.request.get(origin + "api/status")
      ).json();
      payload.snapshot.checked_at = "2020-01-01T00:00:00Z";
      await page.route("**/api/status", (route) =>
        route.fulfill({ json: payload }),
      );
      await page.getByRole("button", { name: "Atualizar" }).click();
      await page.getByText("Recolha atrasada", { exact: true }).waitFor();
      await page.unroute("**/api/status");
      await page.getByRole("button", { name: "Atualizar" }).click();
      await page.getByText("Recolha ativa", { exact: true }).waitFor();
    }
    if (width === 1440 || width === 320)
      await page.screenshot({
        path: `/tmp/blu-monitoring-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("link", { name: "Gerir utilizadores" }).click();
    await page.getByRole("heading", { name: "Quem pode entrar." }).waitFor();
    const username = `reader-${width}`;
    await page.getByLabel("Nome de utilizador", { exact: true }).fill(username);
    await page
      .getByLabel("Palavra-passe inicial", { exact: true })
      .fill("fixture-reader-password");
    await page
      .getByLabel("Confirmar palavra-passe inicial", { exact: true })
      .fill("fixture-reader-password");
    await page.getByRole("button", { name: "Criar utilizador" }).click();
    await page.getByText("Utilizador criado.", { exact: true }).waitFor();
    const account = () =>
      page.getByRole("article", { name: `Conta ${username}`, exact: true });
    await account().waitFor();
    await checkWidth();
    const readerContext = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const readerPage = await readerContext.newPage();
    const readerLogin = async (password) => {
      await readerPage.goto(origin + "login");
      await readerPage.getByLabel("Utilizador").fill(username);
      await readerPage
        .getByLabel("Palavra-passe", { exact: true })
        .fill(password);
      await readerPage
        .getByRole("button", { name: "Entrar no centro de operações" })
        .click();
    };
    await readerLogin("fixture-reader-password");
    await readerPage
      .getByRole("heading", { name: "O sistema, à vista." })
      .waitFor();
    assert.equal(
      await readerPage
        .getByRole("link", { name: "Gerir utilizadores" })
        .count(),
      0,
    );
    assert.equal(
      (await readerContext.request.get(origin + "users")).status(),
      403,
    );
    await account().getByText("Alterar palavra-passe", { exact: true }).click();
    await account()
      .getByLabel("Nova palavra-passe", { exact: true })
      .fill("fixture-new-reader-password");
    await account()
      .getByLabel("Confirmar nova palavra-passe", { exact: true })
      .fill("fixture-new-reader-password");
    await account()
      .getByRole("button", { name: "Guardar palavra-passe" })
      .click();
    await page
      .getByText(
        "Palavra-passe alterada. As sessões dessa conta foram terminadas.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      (await readerContext.request.get(origin + "api/status")).status(),
      401,
    );
    await readerLogin("fixture-new-reader-password");
    await readerPage
      .getByRole("heading", { name: "O sistema, à vista." })
      .waitFor();
    await account().getByText("Perfil e estado", { exact: true }).click();
    await account().getByLabel("Estado", { exact: true }).selectOption("false");
    await account().getByRole("button", { name: "Guardar alterações" }).click();
    await page
      .getByText("Conta atualizada. As sessões dessa conta foram terminadas.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      (await readerContext.request.get(origin + "api/status")).status(),
      401,
    );
    await readerLogin("fixture-new-reader-password");
    await readerPage
      .getByText("Credenciais inválidas.", { exact: true })
      .waitFor();
    await account().getByText("Perfil e estado", { exact: true }).click();
    await account().getByLabel("Estado", { exact: true }).selectOption("true");
    await account().getByLabel("Perfil", { exact: true }).selectOption("admin");
    await account().getByRole("button", { name: "Guardar alterações" }).click();
    await page
      .getByText("Conta atualizada. As sessões dessa conta foram terminadas.", {
        exact: true,
      })
      .waitFor();
    await readerLogin("fixture-new-reader-password");
    await readerPage.getByRole("link", { name: "Gerir utilizadores" }).click();
    await readerPage
      .getByRole("heading", { name: "Quem pode entrar." })
      .waitFor();
    assert.equal(
      (await readerContext.request.get(origin + "users")).status(),
      200,
    );
    if (width === 320 || width === 1440)
      await page.screenshot({
        path: `/tmp/blu-users-${width}.png`,
        fullPage: true,
      });
    await account().getByText("Remover conta", { exact: true }).click();
    await account().getByRole("checkbox").check();
    await account()
      .getByRole("button", { name: "Remover definitivamente" })
      .click();
    await page.getByText("Conta removida.", { exact: true }).waitFor();
    assert.equal(await account().count(), 0);
    assert.equal(
      (await readerContext.request.get(origin + "api/status")).status(),
      401,
    );
    const selfAccount = page.getByRole("article", {
      name: "Conta operator",
      exact: true,
    });
    await selfAccount.getByText("Perfil e estado", { exact: true }).click();
    await selfAccount
      .getByLabel("Perfil", { exact: true })
      .selectOption("viewer");
    await selfAccount
      .getByRole("button", { name: "Guardar alterações" })
      .click();
    await page
      .getByText("Tem de existir pelo menos um administrador ativo.", {
        exact: true,
      })
      .waitFor();
    await checkWidth();
    await readerContext.close();
    await page.getByRole("link", { name: "Voltar ao painel" }).click();
    await page.getByRole("heading", { name: "O sistema, à vista." }).waitFor();
    await page.route("**/api/status", (route) => route.abort());
    await page.getByRole("button", { name: "Atualizar" }).click();
    await page
      .getByText("Não foi possível atualizar.", { exact: false })
      .waitFor();
    await page.unroute("**/api/status");
    await page.getByRole("button", { name: "Terminar sessão" }).click();
    await page.getByLabel("Utilizador").waitFor();
    assert.equal(
      (await context.request.get(origin + "api/status")).status(),
      401,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      `${width}: login, gestão de contas, perfis, revogação de sessões, último administrador e responsividade OK`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  fixture.kill();
}
