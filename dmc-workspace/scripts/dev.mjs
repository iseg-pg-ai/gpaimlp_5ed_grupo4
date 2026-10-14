import { spawn } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.SAGEMAKER_APP_TYPE === "CodeEditor" || process.env.PORTAL_ASSET_PREFIX) {
  process.argv.push("--dev");
  await import("./start-aws.mjs");
} else {
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code) => process.exit(code ?? 1));
}
