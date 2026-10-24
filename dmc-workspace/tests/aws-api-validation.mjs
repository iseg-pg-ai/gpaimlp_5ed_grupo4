import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Run against an isolated start:aws process with BLU_EXPORT_DIR pointing to /tmp.
const base = process.env.AWS_TEST_URL;
if (!base || new URL(base).port !== "3002")
  throw new Error("Use the isolated test server on port 3002");
const publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN;
const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
Object.assign(snapshot.brief, {
  childrenAges: "8",
  specialOccasion: "",
  notes: "",
  accommodation: "Boutique",
  diningPace: "Relaxed Dining (~90m)",
});
const tripId = `aws-validation-${Date.now()}`;
const results = [];
async function request(path, body) {
  return fetch(`${base}${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(120000),
  });
}
async function check(name, action) {
  const started = Date.now();
  try {
    const detail = await action();
    results.push({ name, ok: true, detail, seconds: (Date.now() - started) / 1000 });
  } catch (error) {
    results.push({ name, ok: false, error: error.message, seconds: (Date.now() - started) / 1000 });
  }
  console.log(JSON.stringify(results.at(-1)));
  writeFileSync("/tmp/portal-aws-api-results.json", JSON.stringify(results, null, 2));
}
await check("Real itinerary generation", async () => {
  const r = await request("/api/itineraries", snapshot.brief);
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.ok(data.itinerary.length > 0);
  return `${data.itinerary.length} days generated`;
});
await check("Save and reload version", async () => {
  const r = await request("/api/versions", {
    tripId,
    snapshot,
    reason: "generated",
    baseVersion: null,
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.equal(data.version, 1);
  const loaded = await request(`/api/versions?tripId=${tripId}&version=1`);
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).snapshot.brief.customerName, snapshot.brief.customerName);
});
for (const format of ["pdf", "bundle"]) {
  await check(`Portuguese ${format} export`, async () => {
    const r = await request(`/api/versions?tripId=${tripId}&version=1&format=${format}&locale=pt`);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, 200, bytes.toString().slice(0, 300));
    assert.ok(
      bytes
        .subarray(0, format === "pdf" ? 4 : 2)
        .equals(Buffer.from(format === "pdf" ? "%PDF" : "PK")),
    );
    return `${bytes.length} bytes`;
  });
}
for (const target of ["en", "es", "fr", "de", "zh"]) {
  await check(`Real translation pt -> ${target}`, async () => {
    const r = await request("/api/translate", {
      target,
      items: [{ text: "Visita ao castelo de Lisboa.", source: "pt" }],
    });
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    assert.ok(data.texts[0]);
    assert.notEqual(data.texts[0], "Visita ao castelo de Lisboa.");
    return data.texts[0];
  });
}
for (const locale of ["en", "zh"])
  await check(`${locale} PDF export`, async () => {
    const r = await request(`/api/versions?tripId=${tripId}&version=1&format=pdf&locale=${locale}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, 200, bytes.toString().slice(0, 300));
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    return `${bytes.length} bytes`;
  });
for (const method of ["document", "link"])
  await check(`Public proposal ${method} share URL`, async () => {
    const r = await request("/api/shares", {
      tripId,
      version: 1,
      locale: "pt",
      method,
      recipient: "validation@example.com",
      consent: true,
      retentionDays: 7,
    });
    const data = await r.json();
    assert.equal(r.status, 201, JSON.stringify(data));
    const url = new URL(data.shareUrl);
    const prefix = new URL(base).pathname;
    assert.ok(
      url.pathname.startsWith(`${prefix}${method === "document" ? "/api/shares/" : "/share/"}`),
    );
    const document = await fetch(`${new URL(base).origin}${url.pathname}`);
    assert.equal(document.status, 200);
    assert.equal(
      url.origin,
      publicOrigin,
      `Generated share URL has incorrect origin: ${url.origin}`,
    );
  });
await check("Catalog POST accepts Studio origin and rejects foreign origins", async () => {
  for (const [origin, status] of [
    [publicOrigin, 400],
    ["https://foreign.example.test", 403],
  ]) {
    const r = await fetch(`${base}/api/catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(r.status, status);
  }
});
await check("Version trash and restore", async () => {
  for (const action of ["trash", "restore"]) {
    const r = await request("/api/versions/trash", { tripId, version: 1, action });
    assert.equal(r.status, 200, await r.text());
    const list = await (await request("/api/versions/trash")).json();
    assert.equal(
      list.some((row) => row.tripId === tripId),
      action === "trash",
    );
  }
});
await check("AI agent service", async () => {
  const r = await fetch("http://127.0.0.1:8000/docs", { signal: AbortSignal.timeout(5000) });
  assert.equal(r.status, 200);
});
process.exitCode = results.some((result) => !result.ok) ? 1 : 0;
console.log(
  `Passed ${results.filter((r) => r.ok).length}/${results.length} real integration checks`,
);
