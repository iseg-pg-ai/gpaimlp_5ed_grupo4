import { generateItinerary, validateBrief, type Catalog } from "@/lib/curation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import { jsonError } from "@/lib/api-response";
import { enrichItineraryWithRoadRouting } from "@/lib/road-routing";

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
    const allRecords = [...catalog.atracoes, ...catalog.experiencias, ...catalog.restaurantes];
    if (!allRecords.length)
      return jsonError(
        "Não existem registos aprovados disponíveis. Abra Catálogo, aprove a oferta e atualize o catálogo para os roteiros.",
        422,
      );
    const result = generateItinerary(brief, catalog);
    try {
      result.itinerary = await enrichItineraryWithRoadRouting(
        result.itinerary,
        allRecords as Array<{
          id?: string;
          id_blu?: string;
          nome_da_experiencia?: string;
          latitude?: number;
          longitude?: number;
        }>,
      );
    } catch (enrichErr) {
      console.warn("Could not enrich road routes with OSRM, proceeding with baseline:", enrichErr);
    }
    return Response.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha na curadoria", 422);
  }
}
