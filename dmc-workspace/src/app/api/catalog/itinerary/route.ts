import { detailsFromRecord } from "@/lib/catalog-details";
import { CatalogStore } from "@/lib/catalog-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Read-only fallback for trips created before catalog details were included in snapshots.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || id.length > 500)
    return Response.json({ error: "Identificador inválido." }, { status: 400 });
  const store = new CatalogStore();
  try {
    const record = store
      .list()
      .find(
        (r) =>
          id === `${r.category}:${r.id}` ||
          id ===
            `${r.category}:${r.raw.id ?? r.raw.id_blu ?? r.raw.nome_da_experiencia ?? r.raw._source_row}`,
      );
    if (!record) return Response.json({ error: "Registo não encontrado." }, { status: 404 });
    return Response.json(detailsFromRecord(record), { headers: { "Cache-Control": "no-store" } });
  } finally {
    store.close();
  }
}
