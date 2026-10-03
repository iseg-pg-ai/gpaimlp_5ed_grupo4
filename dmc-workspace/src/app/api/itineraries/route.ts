import { generateItinerary, validateBrief, type Catalog } from "@/lib/curation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
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
    catalog = await loadPublishedCatalog();
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
