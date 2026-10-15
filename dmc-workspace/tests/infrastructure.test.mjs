import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { createRequire } from "node:module";
import { awsConfig, validateBuild } from "../scripts/aws-config.mjs";
import { publicUrl, publicOrigin } from "../src/lib/server-http.ts";

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
