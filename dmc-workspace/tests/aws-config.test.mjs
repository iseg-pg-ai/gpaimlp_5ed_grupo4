import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { awsConfig, validateBuild } from "../scripts/aws-config.mjs";

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
