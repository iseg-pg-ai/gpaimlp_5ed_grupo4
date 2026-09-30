import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateItinerary, validateBrief, type Catalog } from "@/lib/curation";
import { CatalogStore } from "@/lib/catalog-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let brief: unknown;
  try {
    brief = await request.json();
    validateBrief(brief);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Briefing inválido" },
      { status: 400 },
    );
  }
  let catalog: Catalog;
  try {
    const entries = await Promise.all(
      ["atracoes", "experiencias", "restaurantes", "curation_rules"].map(async (name) => {
        const contents = await readFile(
          path.resolve(process.cwd(), "../warehouse", `${name}.jsonl`),
          "utf8",
        );
        return [
          name,
          contents
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line)),
        ];
      }),
    );
    catalog = Object.fromEntries(entries) as Catalog;
    const store = new CatalogStore();
    try {
      for (const category of ["atracoes", "restaurantes", "experiencias"] as const)
        catalog[category] = catalog[category].filter((row) => store.isPublished(row));
    } finally {
      store.close();
    }
    const overrides = JSON.parse(
      await readFile(path.resolve(process.cwd(), "../config/curation_rule_overrides.json"), "utf8"),
    );
    catalog.curation_rules = catalog.curation_rules.map((rule) => ({
      ...rule,
      ...overrides[String(rule.id)],
    }));
  } catch {
    return Response.json(
      { error: "Warehouse indisponível ou inválido. Execute o ETL antes de gerar propostas." },
      { status: 503 },
    );
  }
  try {
    if (![...catalog.atracoes, ...catalog.experiencias, ...catalog.restaurantes].length)
      return Response.json(
        {
          error:
            "Não existem registos aprovados disponíveis. Abra Catálogo, aprove a oferta e atualize o catálogo para os roteiros.",
        },
        { status: 422 },
      );
    return Response.json(generateItinerary(brief, catalog));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha na curadoria" },
      { status: 422 },
    );
  }
}
