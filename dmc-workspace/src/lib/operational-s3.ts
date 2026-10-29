// Publica o estado operacional para a recuperação remota sem criar uma persistência paralela
// no navegador.
import { spawn } from "node:child_process";
import path from "node:path";
import { operationalRoot } from "./version-persistence.ts";

let publication: Promise<void> = Promise.resolve();

function publishOnce(): Promise<void> {
  const bucket = process.env.BLU_DATA_S3_BUCKET?.trim();
  if (!bucket) return Promise.resolve();
  const project = path.resolve(process.cwd(), "..");
  const python = process.env.BLU_PYTHON ?? path.join(project, ".venv/bin/python");
  const catalog = path.resolve(
    project,
    process.env.BLU_DATA_DIR ?? "data",
    "portal/catalog.sqlite",
  );
  const exports = path.resolve(
    /* turbopackIgnore: true */
    process.env.BLU_EXPORT_DIR ?? path.join(project, "exports/itineraries"),
  );
  const pending = operationalRoot();
  return new Promise((resolve, reject) => {
    // O executável e os dados são fornecidos pelo ambiente de runtime.
    const processHandle = spawn(
      /* turbopackIgnore: true */
      python,
      [
        "-B",
        "-m",
        "etl.operational_s3",
        "publish",
        "--catalog",
        catalog,
        "--exports",
        exports,
        "--pending",
        pending,
      ],
      { cwd: project, env: process.env, stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostic = "";
    processHandle.stderr.setEncoding("utf8");
    processHandle.stderr.on("data", (chunk: string) => {
      if (diagnostic.length < 4000) diagnostic += chunk;
    });
    processHandle.once("error", reject);
    processHandle.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Publicação operacional S3 falhou (${code}): ${diagnostic.trim()}`));
    });
  });
}

/** Serializa snapshots para o apontador ativo nunca recuar dentro do processo. */
export function syncOperationalState(): Promise<void> {
  const next = publication.then(publishOnce, publishOnce);
  publication = next.catch(() => undefined);
  return next;
}
