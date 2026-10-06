import { spawnSync } from "node:child_process";

const portal = process.env.PORTAL_URL ?? "http://localhost:3001";
try {
  const response = await fetch(portal);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  console.error(
    `Portal indisponível em ${portal}. Inicie-o antes da conformidade: npm run dev -- -p 3001`,
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const npmStep = (script) =>
  process.platform === "win32"
    ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm run ${script}`]]
    : ["npm", ["run", script]];
const [checkCommand, checkArgs] = npmStep("check");
const [buildCommand, buildArgs] = npmStep("build");
const steps = [
  [checkCommand, checkArgs, "Qualidade, tipos e regressão unitária"],
  [process.execPath, ["tests/catalog-etl.mjs"], "Integração catálogo → ETL → warehouse"],
  ...[
    "briefing",
    "catalog",
    "confirmations",
    "assistant",
    "eligible-addition",
    "delivery",
    "itinerary-visual",
    "responsive",
    "navigation",
    "dataset",
    "trash",
    "workspace-recovery",
  ].map((name) => [process.execPath, [`tests/browser/${name}.mjs`], `Browser: ${name}`]),
  [buildCommand, buildArgs, "Build de produção"],
];

for (const [command, args, label] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, PORTAL_URL: portal },
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nConformidade integrada concluída com sucesso.");
