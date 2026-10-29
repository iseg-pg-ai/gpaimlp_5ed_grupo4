// Processo de ensaio que escreve em paralelo para verificar os contratos de concorrência
// entre instâncias.
import { readFileSync } from "node:fs";
import { CatalogStore } from "../../src/lib/catalog-store.ts";
import { VersionStore } from "../../src/lib/version-store.ts";

const [mode, root, inputPath, label] = process.argv.slice(2);
try {
  if (mode === "catalog") {
    const store = new CatalogStore(root);
    const input = JSON.parse(readFileSync(inputPath, "utf8"));
    const record = await store.save({
      ...input,
      fields: { ...input.fields, name: `Edição ${label}` },
    });
    console.log(JSON.stringify({ outcome: "saved", revision: record.revision }));
  } else if (mode === "version") {
    const store = new VersionStore(root);
    const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
    snapshot.brief.notes = `Edição ${label}`;
    const record = store.save("multi-process", snapshot, "edited", 1);
    store.close();
    console.log(JSON.stringify({ outcome: "saved", version: record.version }));
  } else {
    throw new Error("Modo de concorrência inválido.");
  }
} catch (error) {
  console.log(
    JSON.stringify({
      outcome: "rejected",
      type: error instanceof Error ? error.constructor.name : "Error",
    }),
  );
}
