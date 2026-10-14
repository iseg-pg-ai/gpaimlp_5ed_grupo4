import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

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
