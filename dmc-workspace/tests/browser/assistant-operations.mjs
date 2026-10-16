import { launchBrowser, readSnapshot, mockTranslation } from "./helpers.mjs";
import assert from "node:assert/strict";
const browser = await launchBrowser();
try {
  for (const width of [390, 1600]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await mockTranslation(page);
    page.on("dialog", (dialog) => dialog.accept());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const snapshot = readSnapshot();
    snapshot.itinerary = snapshot.itinerary.slice(0, 1);
    snapshot.itinerary[0].items = snapshot.itinerary[0].items.slice(0, 1);
    const data = {
      versions: [{ tripId: "synthetic-trip", version: 1 }],
      selected: { tripId: "synthetic-trip", version: 1 },
      snapshot,
      weather: {},
      feedback: [],
      responses: [],
      quality: [],
      cases: [],
      comparison: null,
      records: [],
      diagnostics: [
        {
          code: "PRICE_UNKNOWN",
          severity: "warning",
          message: "Custos por confirmar",
          source: "Snapshot",
        },
      ],
      budget: { totals: { EUR: { confirmed: 0, estimated: 1200 } }, incomplete: true },
      metrics: {
        total: 2,
        accepted: 1,
        rejected: 1,
        expired: 0,
        corrections: 0,
        models: [
          {
            modelId: "mock-model",
            runs: 2,
            inputTokens: 100,
            outputTokens: 20,
            averageLatencyMs: 500,
            costUsd: null,
          },
        ],
        decisions: [],
      },
    };
    let completed = 0,
      feedbackWrites = 0,
      approved = 0,
      communications = 0;
    await page.route("**/api/assistant/operations**", async (route) => {
      const request = route.request();
      if (request.headers().authorization !== "Bearer synthetic-test-token")
        return route.fulfill({
          status: 401,
          json: { error: "Autenticação operacional necessária." },
        });
      if (request.method() === "GET") return route.fulfill({ json: data });
      const body = request.postDataJSON();
      assert.equal(body.confirm, true);
      assert.equal(body.operator, undefined);
      if (body.action === "complete") {
        completed++;
        data.feedback = [
          {
            tripId: "synthetic-trip",
            version: 1,
            status: "pending",
            operator: "Servidor",
            completedAt: "2026-10-16",
          },
        ];
      }
      if (body.action === "feedback") {
        feedbackWrites++;
        assert.equal(body.feedback.items.length, 1);
        assert.equal(body.feedback.items[0].ratings.overall, 5);
        data.responses = body.feedback.items;
        data.feedback[0].status = "submitted";
      }
      if (body.action === "approve-case") {
        approved++;
        data.cases = [
          {
            caseId: "reviewed-case",
            score: 7,
            reasons: ["Mesmo destino", "Feedback revisto"],
            items: [{ catalogId: "synthetic-catalog" }],
          },
        ];
      }
      if (body.action === "communication") {
        communications++;
        return route.fulfill({
          json: { draft: "Rascunho sintético para revisão", sent: false, requiresReview: true },
        });
      }
      return route.fulfill({ json: { ok: true } });
    });
    const base = (process.env.PORTAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
    await page.goto(`${base}/assistant`);
    await page.getByLabel("Token operacional", { exact: true }).fill("wrong-token");
    await page.getByRole("button", { name: "Entrar / atualizar" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Autenticação operacional necessária" })
      .waitFor();
    await page.getByLabel("Token operacional", { exact: true }).fill("synthetic-test-token");
    await page.getByRole("button", { name: "Entrar / atualizar" }).click();
    await page.getByRole("heading", { name: "Verificação antes de exportar" }).waitFor();
    await page.getByRole("button", { name: "Preparar rascunho de email", exact: true }).click();
    await page.getByLabel("Rascunho editável — rever antes de enviar").waitFor();
    assert.equal(communications, 1);
    await page.getByRole("button", { name: "Feedback pós-viagem", exact: true }).click();
    await page
      .getByRole("button", { name: "Marcar viagem concluída — feedback pendente", exact: true })
      .click();
    await page.getByRole("combobox", { name: /^Resultado/ }).waitFor();
    await page.getByRole("combobox", { name: /^Resultado/ }).selectOption("completed");
    await page.getByRole("combobox", { name: /^Global/ }).selectOption("5");
    await page.getByRole("button", { name: "Rever e guardar feedback", exact: true }).click();
    await page.getByText(/Feedback entregue por Servidor/).waitFor();
    assert.equal(completed, 1);
    assert.equal(feedbackWrites, 1);
    await page
      .getByRole("button", { name: "Rever e aprovar como caso histórico", exact: true })
      .click();
    await page.getByText("Operação registada.", { exact: true }).waitFor();
    assert.equal(approved, 1);
    await page.getByRole("button", { name: "Casos históricos", exact: true }).click();
    await page.getByRole("heading", { name: "Caso reviewed-case · relevância 7" }).waitFor();
    await page.getByRole("button", { name: "Desempenho", exact: true }).click();
    await page.getByText("Custo monetário não configurado", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.getByRole("button", { name: "Terminar sessão", exact: true }).click();
    assert.equal(
      await page.getByRole("heading", { name: "Desempenho do assistente", exact: true }).count(),
      0,
    );
    assert.equal(await page.getByLabel("Token operacional", { exact: true }).inputValue(), "");
    assert.deepEqual(errors, []);
    console.log(`Operações autenticadas → feedback → caso → métricas: ${width}px OK`);
    await page.close();
  }
} finally {
  await browser.close();
}
