import { launchBrowser } from "./helpers.mjs";
import assert from "node:assert/strict";

const prefix = "/codeeditor/default/ports/3001";
const origin = process.env.PORTAL_PUBLIC_ORIGIN ?? "https://portal.test";
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const escaped = [];
  const failures = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
      escaped.push(url.pathname);
      await route.fulfill({ status: 404, body: "Outside portal proxy" });
      return;
    }
    // Keep the smoke test read-only: never run automatic deletion.
    if (url.pathname.endsWith("/api/trash/cleanup") && route.request().postData() !== "{}") {
      await route.fulfill({ json: { deletedTripIds: [], deletedVersions: [] } });
      return;
    }
    let response = await route.fetch({
      url: `http://127.0.0.1:3001${url.pathname.slice(prefix.length) || "/"}${url.search}`,
      maxRedirects: 0,
    });
    let headers = response.headers();
    // Studio rewrites root-relative redirects. Emulate that behavior so this
    // test catches duplicated proxy prefixes rather than silently following.
    if (headers.location?.startsWith("/")) {
      headers.location = `${origin}/ports/3001${headers.location}`;
    }
    if (response.status() >= 300 && response.status() < 400 && headers.location) {
      const destination = new URL(headers.location);
      assert.equal(destination.origin, origin);
      assert.ok(
        destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`),
        `Redirect escaped portal: ${headers.location}`,
      );
      // Playwright routing does not intercept redirected requests. Resolve the
      // checked public redirect through the same stripped-prefix proxy here.
      response = await route.fetch({
        url: `http://127.0.0.1:3001${destination.pathname.slice(prefix.length) || "/"}${destination.search}`,
        maxRedirects: 0,
      });
      headers = response.headers();
    }
    if (response.status() >= 500 || response.status() === 404) {
      failures.push(`${response.status()} ${url.pathname}${url.search}`);
    }
    await route.fulfill({ response, headers });
  });
  await page.goto(`${origin}${prefix}/docs`, { waitUntil: "networkidle" });
  // Force an RSC cache-key correction and check its redirect through Studio.
  const rscStatus = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { RSC: "1" } });
    return response.status;
  }, `${prefix}/?_rsc=invalid-test-key`);
  assert.equal(rscStatus, 200, "RSC correction should remain inside the public proxy");
  for (const path of ["/catalog", "/exports", "/trash", "/"]) {
    const publicPath = path === "/" ? prefix : `${prefix}${path}`;
    const selector =
      path === "/"
        ? `header nav:visible a[href="${prefix}"], header nav:visible a[href="${prefix}/"]`
        : `header nav:visible a[href="${publicPath}"]`;
    await page.locator(selector).first().click();
    await page.waitForURL(
      (url) =>
        url.origin === origin &&
        (url.pathname === publicPath || (path === "/" && url.pathname === `${prefix}/`)),
    );
    await page.waitForLoadState("networkidle");
    console.log(`Navigation OK: ${path}`);
  }
  for (const path of ["/api/translate", "/api/trash/cleanup"]) {
    const status = await page.evaluate(async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return response.status;
    }, `${prefix}${path}`);
    assert.equal(status, 400, `${path} should reach application validation`);
    console.log(`API reached: ${path}`);
  }
  assert.deepEqual(escaped, [], "Requests escaped the portal proxy");
  assert.deepEqual(failures, [], "Missing or failing resources");
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log("SageMaker proxy smoke test passed");
} finally {
  await browser.close();
}
