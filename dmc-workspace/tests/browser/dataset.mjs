import { launchBrowser } from "./helpers.mjs";
import assert from "node:assert/strict";
const browser = await launchBrowser();
const base = (process.env.PORTAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
try {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    await page.goto(`${base}/references`);
    assert.ok(new URL(page.url()).pathname.endsWith("/catalog"));
    assert.equal(await page.getByTestId("dataset-explorer").count(), 0);
    const response = await page.request.get(`${base}/api/dataset?table=structured_precos_base`);
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.ok(data.total > 25);
    assert.equal(data.rows.length, 25);
    assert.equal((await page.request.get(`${base}/api/dataset?table=../secret`)).status(), 400);
    await context.close();
  }
  console.log(
    "Referências antigas encaminhadas para o Catálogo; API de fontes e allowlist preservadas.",
  );
} finally {
  await browser.close();
}
