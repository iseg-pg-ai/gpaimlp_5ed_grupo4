import { generateItinerary, validateBrief, type Catalog } from "@/lib/curation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import { jsonError } from "@/lib/api-response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let brief: unknown;
  try {
    brief = await request.json();
    validateBrief(brief);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Briefing inválido", 400);
  }
  let catalog: Catalog;
  try {
    catalog = await loadPublishedCatalog();
  } catch {
    return jsonError(
      "Warehouse indisponível ou inválido. Execute o ETL antes de gerar propostas.",
      503,
    );
  }
  try {
    if (![...catalog.atracoes, ...catalog.experiencias, ...catalog.restaurantes].length)
      return jsonError(
        "Não existem registos aprovados disponíveis. Abra Catálogo, aprove a oferta e atualize o catálogo para os roteiros.",
        422,
      );
    return Response.json(generateItinerary(brief, catalog));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha na curadoria", 422);
  }
}
