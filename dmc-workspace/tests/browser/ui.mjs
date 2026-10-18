import { mockTranslation, readSnapshot, launchBrowser } from "./helpers.mjs";
import assert from "node:assert/strict";

async function navigation(browser) {
  const portal = process.env.PORTAL_URL ?? "http://127.0.0.1:3001";
  const prefix = new URL(portal).pathname.replace(/\/$/, "");

  for (const width of [320, 768, 1024, 1440, 1920, 2560])
    for (const locale of ["pt", "en", "es", "fr", "de", "zh"]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript(
        (locale) => localStorage.setItem("blu-portal-language", locale),
        locale,
      );
      await mockTranslation(page);
      await page.goto(portal);
      await page.waitForFunction(
        (locale) => document.documentElement.lang.startsWith(locale),
        locale,
      );
      for (const route of ["/catalog", "/exports", "/references", "/trash", "/"]) {
        const bar = page.getByTestId("top-bar");
        if (width < 1024) await bar.locator("details").first().locator("summary").click();
        const href = route === "/" ? prefix || "/" : `${prefix}${route}`;
        await bar
          .locator("nav:visible")
          .locator(`a[href="${href}"], a[href="${href}/"]`)
          .first()
          .click();
        await page.waitForURL((url) => url.pathname.replace(/\/$/, "") === href.replace(/\/$/, ""));
        if (width < 1024) {
          assert.equal(await bar.locator("nav:visible").count(), 0);
          await bar.locator("details").first().locator("summary").click();
        }
        assert.equal(
          (await bar.locator('nav:visible a[aria-current="page"]').getAttribute("href")).replace(
            /\/$/,
            "",
          ),
          href.replace(/\/$/, ""),
        );
        if (width < 1024) await bar.locator("details").first().locator("summary").click();
        await page.evaluate(() => {
          document.querySelectorAll("main").forEach((e) => (e.scrollTop = 1000));
          document.querySelector(
            '[data-testid="top-bar"]',
          ).parentElement.lastElementChild.scrollTop = 1000;
        });
        assert.equal(Math.round((await bar.boundingBox()).y), 0);
        const frame = page.locator("main.portal-page, .responsive-workspace.portal-frame").first();
        await frame.waitFor();
        const frameBox = await frame.boundingBox();
        const headerBox = await bar.locator(".portal-frame").boundingBox();
        assert.ok(Math.abs(frameBox.width - width) < 1, "A página não acompanha o ecrã");
        assert.ok(Math.abs(frameBox.x - headerBox.x) < 1, "Margens laterais diferentes");
        assert.ok(Math.abs(frameBox.width - headerBox.width) < 1, "Larguras de página diferentes");
        if (route !== "/") {
          const pagePadding = await frame.evaluate((node) => getComputedStyle(node).paddingLeft);
          const headerPadding = await bar
            .locator(".portal-frame")
            .evaluate((node) => getComputedStyle(node).paddingLeft);
          assert.equal(pagePadding, headerPadding, "Espaçamento horizontal diferente");
        }

        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      }
      console.log(width, locale, "navigation OK");
      await context.close();
    }
}

async function responsive(browser) {
  const snapshot = readSnapshot();
  Object.assign(snapshot.brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
  });
  snapshot.itinerary[0].items[0].transitToNext = {
    mode: "walk",
    duration: "37 min",
    fromLocation: "Origem com nome muito longo para testar o layout",
    toLocation: "Destino com nome muito longo para testar o layout",
    routeNote: "Notas de percurso. ".repeat(30),
  };
  if (process.env.STRESS) {
    snapshot.itinerary = Array.from({ length: 12 }, (_, i) => ({
      ...structuredClone(snapshot.itinerary[0]),
      dayNumber: i + 1,
      title: "LongTitle".repeat(35),
    }));
  }
  for (const width of process.env.STRESS ? [360] : [320, 360, 640, 768, 1440])
    for (const language of process.env.STRESS ? ["de"] : ["pt", "en", "es", "fr", "de", "zh"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 640 ? 320 : 700 },
        isMobile: width < 768,
        hasTouch: width < 768,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ snapshot, language, stress }) => {
          localStorage.setItem("blu-portal-language", language);
          localStorage.setItem(
            "blu-trips-v1",
            JSON.stringify([
              {
                id: "responsive-test",
                ...snapshot,
                messages: stress
                  ? Array.from({ length: 40 }, (_, i) => ({
                      id: String(i),
                      sender: "user",
                      text: "Long conversation message ".repeat(30),
                      timestamp: "12:00",
                    }))
                  : [],
              },
              ...(stress
                ? Array.from({ length: 40 }, (_, i) => ({
                    id: "extra-" + i,
                    ...snapshot,
                    brief: { ...snapshot.brief, customerName: "Extra group " + i },
                    messages: [],
                  }))
                : []),
            ]),
          );
        },
        { snapshot, language, stress: Boolean(process.env.STRESS) },
      );
      await mockTranslation(page);
      await page.route("**/api/versions?*", (r) => r.fulfill({ json: [] }));
      await page.goto(process.env.PORTAL_URL ?? "http://127.0.0.1:3001");
      await page.waitForTimeout(500);
      await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
      async function check(stage) {
        const overflow = await page.evaluate(() => ({
          body: document.documentElement.scrollWidth > innerWidth,
          main: [...document.querySelectorAll("main")].some(
            (e) => e.scrollWidth > e.clientWidth + 2,
          ),
        }));
        if (overflow.body || overflow.main)
          throw new Error(JSON.stringify({ width, language, stage, overflow }));
      }
      await check("brief");
      if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1))
        throw Error("Page height overflow");
      if (width < 1024) {
        const trigger = page.locator('[aria-controls="trip-navigation"]');
        await trigger.click();
        await page.locator("#trip-navigation").waitFor({ state: "visible" });
        const box = await page.locator("#trip-navigation").boundingBox();
        if (box.width >= width || box.x !== 0) throw Error("drawer bounds");
        await page.keyboard.press("Escape");
        await page.locator("#trip-navigation").waitFor({ state: "hidden" });
        if (await page.locator("#trip-navigation").isVisible()) throw Error("Escape");
        await trigger.click();
        await page.locator("#trip-navigation").waitFor({ state: "visible" });
        await page.mouse.click(width - 4, 100);
        await page.locator("#trip-navigation").waitFor({ state: "hidden" });
        if (await page.locator("#trip-navigation").isVisible()) throw Error("backdrop");
        await trigger.click();
        await page.locator("#trip-navigation").waitFor({ state: "visible" });
        await page.keyboard.press("Tab");
        if (
          !(await page
            .locator("#trip-navigation")
            .evaluate((e) => e.contains(document.activeElement)))
        )
          throw Error("Drawer focus escaped");
      }

      await page
        .locator("aside:visible button")
        .filter({ hasText: snapshot.brief.customerName })
        .click();
      await page.locator("#trip-navigation").waitFor({ state: "hidden" });
      if (await page.locator("#trip-navigation").isVisible())
        throw Error("selection must close drawer");
      if (process.env.STRESS) {
        await page.evaluate(() => {
          document.querySelector("main").scrollTop = 100000;
        });
      }
      await check("itinerary");
      await page.locator(".group.relative.z-10").first().focus();
      await page.keyboard.press("Enter");
      const modal = page.locator(".transit-dialog[open] > div").last();
      await modal.waitFor({ state: "visible" });
      const bounds = await modal.boundingBox();
      if (bounds.y < 0 || bounds.y + bounds.height > (width === 640 ? 320 : 700) + 1)
        throw Error("Modal outside viewport");
      await page.keyboard.press("Escape");
      await page.locator(".transit-dialog").waitFor({ state: "hidden" });
      if (await page.locator(".transit-dialog").isVisible()) throw Error("Modal Escape");
      if (
        !(await page
          .locator(".group.relative.z-10")
          .first()
          .evaluate((e) => e === document.activeElement))
      )
        throw Error("Modal focus not restored");
      if (width < 1280) {
        const launcher = page.locator('[aria-controls="curation-assistant"]');
        const circle = await launcher.boundingBox();
        if (Math.abs(circle.width - circle.height) > 1 || circle.width < 44)
          throw Error("Assistant launcher must be round and touch-sized");
        await launcher.click();
        await page.locator("#curation-assistant").waitFor({ state: "visible" });
        const panel = await page.locator("#curation-assistant").boundingBox();
        if (panel.x < 0 || panel.y < 0 || panel.x + panel.width > width + 1)
          throw Error("Assistant popup outside viewport");
        await page.keyboard.press("Escape");
        await page.locator("#curation-assistant").waitFor({ state: "hidden" });
        if (await page.locator("#curation-assistant").isVisible()) throw Error("Assistant Escape");
        await launcher.click();
        await page.locator("#curation-assistant").waitFor({ state: "visible" });
      } else {
        const assistant = await page.locator("#curation-assistant").boundingBox();
        const itinerary = await page
          .locator("#curation-assistant")
          .locator("xpath=../preceding-sibling::*[1]")
          .boundingBox();
        if (!assistant || assistant.x < itinerary.x + itinerary.width - 1)
          throw Error("Desktop assistant must be visible on the right");
        const frame = await page.locator(".responsive-workspace").boundingBox();
        if (Math.abs(assistant.y - frame.y) > 1 || Math.abs(assistant.height - frame.height) > 1)
          throw Error("Assistant must fill workspace height");
      }
      await check("assistant");

      if (width === 640) {
        await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
        await check("large text");
      }
      if (errors.length) throw Error(errors.join("\n"));
      console.log(width, language, "OK");
      await context.close();
    }
}

const scenarios = { responsive, navigation };
const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(scenarios);
for (const name of names) {
  if (!Object.hasOwn(scenarios, name))
    throw new Error("Cenário de interface desconhecido: " + name);
}
const browser = await launchBrowser();
try {
  for (const name of names) await scenarios[name](browser);
} finally {
  await browser.close();
}
