import { queryDataset } from "../src/lib/python-portal.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { createRequire } from "node:module";
import { awsConfig, validateBuild } from "../scripts/aws-config.mjs";
import { publicUrl, publicOrigin, rejectForeignOrigin } from "../src/lib/server-http.ts";

const origin = "https://colega.studio.example.com";
test("AWS: validar origem, porta e prefixo em ambientes distintos", () => {
  assert.deepEqual(awsConfig({ PORTAL_PUBLIC_ORIGIN: origin, PORT: "3100" }, []), {
    origin,
    port: 3100,
    prefix: "/codeeditor/default/ports/3100",
  });
  for (const value of [
    undefined,
    "http://studio.example.com",
    `${origin}/codeeditor/default`,
    `${origin}?a=1`,
    "https://user:pass@studio.example.com",
  ]) {
    assert.throws(() => awsConfig({ PORTAL_PUBLIC_ORIGIN: value }, []), /PORTAL_PUBLIC_ORIGIN/);
  }
  for (const port of ["0", "65536", "abc", "3.5"]) {
    assert.throws(
      () => awsConfig({ PORTAL_PUBLIC_ORIGIN: origin, PORT: port }, []),
      /Porta inválida/,
    );
  }
  assert.throws(() => awsConfig({ PORTAL_PUBLIC_ORIGIN: origin }, ["-p"]), /Porta inválida/);
  assert.throws(
    () =>
      awsConfig(
        { PORTAL_PUBLIC_ORIGIN: origin, PORTAL_ASSET_PREFIX: "/codeeditor/default/ports/3002" },
        [],
      ),
    /PORTAL_ASSET_PREFIX/,
  );
});
test("AWS: rejeitar build ausente, incompleto ou compilado para outro prefixo", () => {
  const directory = mkdtempSync(join(tmpdir(), "blu-aws-build-"));
  const prefix = "/codeeditor/default/ports/3001";
  try {
    assert.throws(() => validateBuild(prefix, directory), /incompleto/);
    writeFileSync(join(directory, "BUILD_ID"), "test");
    mkdirSync(join(directory, "static"));
    writeFileSync(join(directory, "static", "chunk.js"), "");
    const manifest = join(directory, "required-server-files.json");
    writeFileSync(manifest, JSON.stringify({ config: { basePath: "" } }));
    assert.throws(() => validateBuild(prefix, directory), /prefixo do build/);
    writeFileSync(
      manifest,
      JSON.stringify({
        config: {
          basePath: prefix,
          assetPrefix: prefix,
          env: { NEXT_PUBLIC_PORTAL_BASE_PATH: prefix },
        },
      }),
    );
    assert.doesNotThrow(() => validateBuild(prefix, directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public share URLs preserve the Studio origin and prefix once", () => {
  const keys = ["BLU_PUBLIC_URL", "PORTAL_PUBLIC_ORIGIN", "NEXT_PUBLIC_PORTAL_BASE_PATH"];
  const saved = keys.map((key) => process.env[key]);
  try {
    delete process.env.BLU_PUBLIC_URL;
    process.env.PORTAL_PUBLIC_ORIGIN = "https://studio.example.test";
    process.env.NEXT_PUBLIC_PORTAL_BASE_PATH = "/codeeditor/default/ports/3001";
    const local = "http://localhost:3000/api/shares";
    assert.equal(
      publicUrl("/share/token", local),
      "https://studio.example.test/codeeditor/default/ports/3001/share/token",
    );
    assert.equal(
      publicUrl("/codeeditor/default/ports/3001/share/token", local),
      "https://studio.example.test/codeeditor/default/ports/3001/share/token",
    );
    assert.equal(publicOrigin(local), "https://studio.example.test");
    process.env.BLU_PUBLIC_URL = "https://public.example.test/proposals/";
    assert.equal(
      publicUrl("/share/token", local),
      "https://public.example.test/proposals/share/token",
    );
    assert.equal(publicOrigin(local), "https://studio.example.test");
    delete process.env.BLU_PUBLIC_URL;
    delete process.env.PORTAL_PUBLIC_ORIGIN;
    delete process.env.NEXT_PUBLIC_PORTAL_BASE_PATH;
    assert.equal(publicUrl("/share/token", local), "http://localhost:3000/share/token");
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});

test("rejectForeignOrigin recusa apenas pedidos de outro site", async () => {
  const saved = process.env.PORTAL_PUBLIC_ORIGIN;
  const post = (url, origin) =>
    new Request(url, { method: "POST", headers: origin ? { origin } : {} });
  try {
    delete process.env.PORTAL_PUBLIC_ORIGIN;
    const local = "http://localhost:3000/api/versions";
    assert.equal(rejectForeignOrigin(post(local)), null);
    assert.equal(rejectForeignOrigin(post(local, "http://localhost:3000")), null);
    for (const foreign of ["https://evil.example", "http://localhost:3001", "null"]) {
      const response = rejectForeignOrigin(post(local, foreign));
      assert.equal(response?.status, 403, foreign);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "Origem inválida." });
    }
    // Atrás do proxy do Studio, a origem pública prevalece sobre o pedido local.
    process.env.PORTAL_PUBLIC_ORIGIN = "https://studio.example.test";
    assert.equal(rejectForeignOrigin(post(local, "https://studio.example.test")), null);
    assert.equal(rejectForeignOrigin(post(local, "http://localhost:3000"))?.status, 403);
  } finally {
    if (saved === undefined) delete process.env.PORTAL_PUBLIC_ORIGIN;
    else process.env.PORTAL_PUBLIC_ORIGIN = saved;
  }
});

test("rotas que alteram dados ou geram custos verificam a origem antes de ler o pedido", () => {
  for (const route of ["versions", "shares", "trash/cleanup", "translate"]) {
    const source = readFileSync(
      new URL(`../src/app/api/${route}/route.ts`, import.meta.url),
      "utf8",
    );
    const post = source.slice(source.indexOf("export async function POST"));
    assert.match(
      post,
      /^export async function POST\(request: Request\) \{\s+const forbidden = rejectForeignOrigin\(request\);\s+if \(forbidden\) return forbidden;/,
      route,
    );
  }
  // O endpoint antigo do assistente delega no planeador, que tem verificação própria.
  const read = (route) =>
    readFileSync(new URL(`../src/app/api/${route}/route.ts`, import.meta.url), "utf8");
  assert.match(read("assistant"), /import \{ POST as plan \} from "\.\/plan\/route";/);
  assert.match(read("assistant/plan"), /origin && origin !== publicOrigin\(request\.url\)/);
});

const require = createRequire(import.meta.url);
const { getRootDirs } = require(
  path.join(path.dirname(require.resolve("@next/eslint-plugin-next")), "utils/get-root-dirs.js"),
);
test("Next ESLint root directory patterns keep exact directory matches", () => {
  const cwd = process.cwd();
  assert.deepEqual(getRootDirs({ cwd, settings: {} }), [cwd]);
  for (const rootDir of ["src/{app,components}", ["src/app", "src/components"]]) {
    assert.deepEqual(getRootDirs({ cwd, settings: { next: { rootDir } } }).sort(), [
      "src/app",
      "src/components",
    ]);
  }
});

test("Dev overlay prefixes root endpoints without changing external or already prefixed URLs", () => {
  const transform = require("../scripts/devtools-prefix-loader.cjs");
  const prefix = "/codeeditor/default/ports/3001";
  const source = `fetch('/__nextjs_original-stack-frames');
    const font = "url(/__nextjs_font/geist-latin.woff2)";
    fetch('${prefix}/__nextjs_original-stack-frames');
    fetch('https://example.test/__nextjs_original-stack-frames');`;
  const transformed = transform.call({ getOptions: () => ({ prefix }) }, source);
  assert.ok(transformed.includes(`fetch('${prefix}/__nextjs_original-stack-frames')`));
  assert.ok(transformed.includes(`url(${prefix}/__nextjs_font/geist-latin.woff2)`));
  assert.ok(transformed.includes("https://example.test/__nextjs_original-stack-frames"));
  assert.ok(!transformed.includes(`${prefix}${prefix}`));
  assert.equal(transform.call({ getOptions: () => ({ prefix: "" }) }, source), source);
});

test("missing Python fails explicitly without hanging or falling back to duplicated rules", async () => {
  const previous = process.env.BLU_PYTHON;
  process.env.BLU_PYTHON = path.join(tmpdir(), "blu-no-such-python", "python");
  try {
    await assert.rejects(queryDataset(tmpdir(), {}), /Python do portal indisponível/);
  } finally {
    if (previous === undefined) delete process.env.BLU_PYTHON;
    else process.env.BLU_PYTHON = previous;
  }
});
