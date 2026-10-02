import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { translateLocal } from "../src/lib/local-translation.ts";
import { TranslationError } from "../src/lib/translation-error.ts";

test("missing Python produces actionable error before spawning or waiting", async (t) => {
  const previous = process.env.BLU_TRANSLATION_PYTHON;
  process.env.BLU_TRANSLATION_PYTHON = path.resolve("nonexistent-audit-python/python.exe");
  t.after(() => {
    if (previous === undefined) delete process.env.BLU_TRANSLATION_PYTHON;
    else process.env.BLU_TRANSLATION_PYTHON = previous;
  });
  await assert.rejects(
    async () => translateLocal([{ text: "Relaxed", source: "en" }], "pt"),
    (error) => {
      assert.equal(error.code, "PYTHON_UNAVAILABLE");
      assert.match(error.message, /BLU_TRANSLATION_PYTHON/);
      return true;
    },
  );
  assert.deepEqual(await translateLocal([{ text: "Português", source: "pt" }], "pt"), [
    "Português",
  ]);
});

test("setup errors provide distinct repair instructions without exposing raw diagnostics", () => {
  assert.match(
    new TranslationError("TRANSLATION_DEPENDENCIES_MISSING").message,
    /pip install -r translations\/requirements.txt/,
  );
  assert.match(
    new TranslationError("TRANSLATION_MODELS_MISSING").message,
    /translations\/setup_models.py/,
  );
  const unknown = new TranslationError("private filesystem path");
  assert.equal(unknown.code, "TRANSLATION_FAILED");
  assert.doesNotMatch(unknown.message, /private filesystem/);
});
