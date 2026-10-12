import { test } from "node:test";
import assert from "node:assert/strict";
import { publicUrl, publicOrigin } from "../src/lib/public-url.ts";

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
