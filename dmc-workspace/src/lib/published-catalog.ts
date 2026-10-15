import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Catalog } from "./curation";
import { CatalogStore, warehouseRoot } from "./catalog-store";
export async function loadPublishedCatalog(): Promise<Catalog> {
  const entries = await Promise.all(
    ["atracoes", "experiencias", "restaurantes", "curation_rules"].map(async (name) => {
      const contents = await readFile(path.join(warehouseRoot(), `${name}.jsonl`), "utf8");
      return [
        name,
        contents
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      ];
    }),
  );
  const catalog = Object.fromEntries(entries) as Catalog;
  const store = new CatalogStore();
  for (const category of ["atracoes", "restaurantes", "experiencias"] as const) {
    const flags = await store.publishedFlags(catalog[category]);
    catalog[category] = catalog[category].filter((_, index) => flags[index]);
  }
  const overrides = JSON.parse(
    await readFile(path.resolve(process.cwd(), "../config/curation_rule_overrides.json"), "utf8"),
  );
  catalog.curation_rules = catalog.curation_rules.map((rule) => ({
    ...rule,
    ...overrides[String(rule.id)],
  }));
  return catalog;
}
