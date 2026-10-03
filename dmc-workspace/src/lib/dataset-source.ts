import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { CatalogRecord } from "./catalog-schema";
export const datasetTables = (root: string) =>
  readdirSync(root)
    .filter((f) => /^structured_[a-z0-9_]+\.jsonl$/.test(f))
    .map((f) => f.slice(0, -6))
    .sort();
export function sourceRows(root: string, table: string): Record<string, unknown>[] {
  if (!datasetTables(root).includes(table)) throw new Error("Folha indisponível.");
  return readFileSync(path.join(root, table + ".jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
export function sourceEnricher(root: string) {
  const bases = {
    atracoes: "structured_atracoes_base",
    restaurantes: "structured_restaurantes_base",
    experiencias: "structured_experiencias_base",
  };
  const available = datasetTables(root);
  const tables = Object.fromEntries(
    Object.entries(bases).map(([key, table]) => [
      key,
      available.includes(table) ? sourceRows(root, table) : [],
    ]),
  );
  const prices = available.includes("structured_precos_base")
    ? sourceRows(root, "structured_precos_base")
    : [];
  return (record: CatalogRecord) => {
    const key =
      record.category === "atracoes"
        ? "id"
        : record.category === "restaurantes"
          ? "id_blu"
          : "nome_da_experiencia";
    const identifier = record.raw[key];
    const source =
      identifier === undefined
        ? undefined
        : tables[record.category].find((row) => row[key] === identifier);
    const references =
      identifier === undefined ? [] : prices.filter((row) => row.id === identifier);
    return {
      ...record,
      sourceData: {
        ...record.raw,
        ...source,
        ...(references.length ? { tarifas_de_referencia: references } : {}),
      },
    };
  };
}
