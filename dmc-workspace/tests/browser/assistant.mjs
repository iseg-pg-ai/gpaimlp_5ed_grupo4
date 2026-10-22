import { launchBrowser, readSnapshot } from "./helpers.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";

const target = process.env.PORTAL_URL || "http://127.0.0.1:3001";
const screenshots = process.env.BLU_SCREENSHOT_DIR;
if (screenshots) mkdirSync(screenshots, { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [1600, 390]) {
    for (const language of ["pt", "en"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(target).origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const snapshot = readSnapshot();
      snapshot.itinerary[0].items.push({
        ...structuredClone(snapshot.itinerary[0].items[0]),
        id: "ui-extra",
        title: "Atividade adicional de teste",
        time: "14:00–15:00 (proposto)",
      });
      Object.assign(snapshot.brief, {
        childrenAges: "",
        specialOccasion: "",
        notes: "",
        accommodation: "Boutique",
        diningPace: "Relaxed Dining (~90m)",
      });
      snapshot.itinerary.forEach((day) =>
        day.items.forEach((item) => {
          item.isLocked = false;
          delete item.confirmation;
        }),
      );
      const tripId = `assistant-${width}-${language}`;
      const other = structuredClone(snapshot);
      other.brief.customerName = "Segunda viagem de teste";
      await page.addInitScript(
        ({ snapshot, other, tripId }) => {
          localStorage.setItem("blu-portal-language", "pt");
          if (!localStorage.getItem("blu-assistant-test-seeded")) {
            localStorage.setItem(
              "blu-trips-v1",
              JSON.stringify([
                { ...snapshot, id: tripId, version: 1, messages: [], assistantLanguage: "pt" },
                { ...other, id: `${tripId}-other`, version: 1, messages: [] },
              ]),
            );
            localStorage.setItem("blu-assistant-test-seeded", "true");
          }
          localStorage.setItem("blu-last-trash-cleanup-v1", String(Date.now()));
        },
        { snapshot, other, tripId },
      );
      const requests = [];
      const translated = [];
      let mode = "proposal";
      let versionPosts = 0;
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname.endsWith("/api/translate")) {
          const items = request.postDataJSON().items;
          translated.push(...items.map((item) => item.text));
          return route.fulfill({ json: { texts: items.map((item) => item.text) } });
        }
        if (pathname.endsWith("/api/versions")) {
          if (request.method() === "POST") versionPosts++;
          return route.fulfill({ json: request.method() === "GET" ? [] : { version: 99 } });
        }
        if (pathname.endsWith("/api/trash/cleanup"))
          return route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } });
        if (!pathname.endsWith("/api/assistant/plan"))
          return route.fulfill({ status: 400, json: { error: "Endpoint não previsto no teste" } });
        const body = request.postDataJSON();
        requests.push(body);
        assert.equal(body.tripId, tripId);
        assert.equal(body.language, language);
        if (body.decision === "reject") return route.fulfill({ json: { rejected: true } });
        if (body.decision === "accept") {
          if (mode === "stale")
            return route.fulfill({
              status: 409,
              json: { error: "A viagem mudou. Peça nova proposta." },
            });
          await new Promise((resolve) => setTimeout(resolve, 150));
          const saved = await page.evaluate(
            (id) => JSON.parse(localStorage.getItem("blu-trips-v1")).find((trip) => trip.id === id),
            tripId,
          );
          const changed = {
            brief: saved.brief,
            itinerary: structuredClone(saved.itinerary),
            pending: saved.pending,
          };
          changed.itinerary[0].items.pop();
          return route.fulfill({ json: { snapshot: changed, version: body.baseVersion + 1 } });
        }
        if (mode === "error")
          return route.fulfill({
            status: 502,
            json: {
              error: language === "en" ? "The planner is unavailable." : "Planeador indisponível.",
            },
          });
        const before = body.snapshot.itinerary;
        const after = structuredClone(before);
        const item = after[0].items.at(-1);
        const clarify = mode === "clarification";
        if (!clarify) after[0].items.pop();
        return route.fulfill({
          json: {
            tripId,
            runId: `run-${requests.length}`,
            baseVersion: body.baseVersion,
            plan: {
              summary: clarify
                ? language === "en"
                  ? "Which activity should I change?"
                  : "Qual é a atividade que pretende alterar?"
                : language === "en"
                  ? "Remove the last activity from day 1."
                  : "Remover a última atividade do dia 1.",
              actions: clarify ? [] : [{ type: "remove_item", dayNumber: 1, itemId: item.id }],
              warnings: [],
              requiresConfirmation: true,
            },
            before,
            after,
            provider: "mock",
            modelId: "test-only",
            impact: {
              changes: ["Uma atividade removida"],
              costs: [
                {
                  currency: "EUR",
                  beforeCents: 10000,
                  afterCents: 9000,
                  beforeConfirmedCents: 0,
                  afterConfirmedCents: 0,
                },
              ],
              pendingBefore: 2,
              pendingAfter: 1,
              incomplete: true,
            },
          },
        });
      });
      const stored = () =>
        page.evaluate(
          (id) => JSON.parse(localStorage.getItem("blu-trips-v1")).find((trip) => trip.id === id),
          tripId,
        );
      const openTrip = async (name) => {
        await page
          .locator("aside.studio-sidebar button")
          .filter({ hasText: name })
          .first()
          .waitFor({ state: "attached" });
        const nav = page.locator('[aria-controls="trip-navigation"]');
        if (width < 1024) {
          await nav.waitFor({ state: "visible" });
          if ((await nav.getAttribute("aria-expanded")) !== "true") await nav.click();
          await page.locator("#trip-navigation").waitFor({ state: "visible" });
        }
        await page
          .locator("aside.studio-sidebar:visible button")
          .filter({ hasText: name })
          .first()
          .click();
        const toggle = page.locator('[aria-controls="curation-assistant"]');
        if (!(await page.locator('input[name="assistantMessage"]').isVisible()))
          await toggle.click();
      };
      const send = async (text) => {
        const input = page.locator('input[name="assistantMessage"]');
        await input.fill(text);
        await input.press("Enter");
        await page.waitForFunction(
          () => !document.querySelector('input[name="assistantMessage"]')?.disabled,
        );
      };
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120000 });
      await openTrip(snapshot.brief.customerName);
      await page.getByTestId("assistant-language").selectOption(language);
      await page.waitForFunction(
        ({ id, language }) =>
          JSON.parse(localStorage.getItem("blu-trips-v1")).find((trip) => trip.id === id)
            .assistantLanguage === language,
        { id: tripId, language },
      );
      const initialCount = snapshot.itinerary[0].items.length;
      await send(
        language === "en"
          ? "Remove the last activity from day 1"
          : "Remove a última atividade do dia 1",
      );
      await page.getByTestId("agent-preview").waitFor();
      assert.equal((await stored()).version, 1);
      assert.equal((await stored()).itinerary[0].items.length, initialCount);
      assert.equal(versionPosts, 0);
      const beforeAck = requests.length;
      await send("ok");
      assert.equal(requests.length, beforeAck);
      assert.equal((await stored()).version, 1);
      await page.getByTestId("agent-impact").locator("summary").click();
      if (screenshots)
        await page.screenshot({
          path: path.join(screenshots, `fase2-preview-${language}-${width}.png`),
          fullPage: true,
        });
      await page.getByTestId("agent-accept").evaluate((button) => {
        button.click();
        button.click();
      });
      await page.waitForFunction(
        (id) =>
          JSON.parse(localStorage.getItem("blu-trips-v1")).find((trip) => trip.id === id)
            .version === 2,
        tripId,
      );
      assert.equal((await stored()).itinerary[0].items.length, initialCount - 1);
      assert.equal(requests.filter((body) => body.decision === "accept").length, 1);
      assert.equal(versionPosts, 0, "A aceitação não pode fazer um segundo save /api/versions");
      await send(
        language === "en"
          ? "Remove another activity from day 1"
          : "Remove outra atividade do dia 1",
      );
      await page.getByTestId("agent-reject").click();
      await page.getByTestId("agent-preview").waitFor({ state: "hidden" });
      assert.equal((await stored()).version, 2);
      assert.equal((await stored()).itinerary[0].items.length, initialCount - 1);
      mode = "clarification";
      await send(language === "en" ? "Change that activity" : "Altera aquela atividade");
      const question =
        language === "en"
          ? "Which activity should I change?"
          : "Qual é a atividade que pretende alterar?";
      await page.getByText(question, { exact: false }).first().waitFor();
      assert.equal(await page.getByTestId("agent-preview").count(), 0);
      await page.waitForTimeout(120);
      assert.ok(
        !translated.some((text) => text.includes(question)),
        "Resposta original não deve ser traduzida pelo idioma da interface",
      );
      mode = "error";
      await send("Erro de teste");
      const error = language === "en" ? "The planner is unavailable." : "Planeador indisponível.";
      await page.getByText(error, { exact: true }).first().waitFor();
      assert.equal((await stored()).version, 2);
      mode = "stale";
      await send("Remove atividade do dia 1");
      await page.getByTestId("agent-accept").click();
      await page.getByTestId("agent-preview").waitFor({ state: "hidden" });
      assert.equal((await stored()).version, 2);
      mode = "proposal";
      await send("Remove atividade do dia 1");
      await page.getByTestId("agent-preview").waitFor();
      await openTrip(other.brief.customerName);
      assert.equal(
        await page.getByTestId("agent-preview").count(),
        0,
        "Proposta de outra viagem nunca é mostrada",
      );
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
      await openTrip(snapshot.brief.customerName);
      assert.equal(await page.getByTestId("assistant-language").inputValue(), language);
      assert.equal((await stored()).version, 2);
      assert.equal(versionPosts, 0);
      assert.deepEqual(pageErrors, [], "Sem erros JavaScript na interface");
      console.log(`Assistant transactional mock ${language} ${width}px: OK`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
