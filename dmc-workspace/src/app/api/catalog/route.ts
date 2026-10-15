import { portalRequest, PortalPythonError } from "@/lib/python-portal";
import { publicOrigin, jsonError, noStoreHeaders } from "@/lib/server-http";
import { CatalogStore, CatalogConflict, catalogRoot, warehouseRoot } from "@/lib/catalog-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    const records = await portalRequest("catalog-query", catalogRoot(), {
      id,
      warehouse: warehouseRoot(),
    });
    return Response.json(records, { headers: noStoreHeaders });
  } catch {
    return jsonError(
      "Não foi possível ler o catálogo. Verifique o warehouse e execute o ETL inicial.",
      503,
    );
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== publicOrigin(request.url))
    return jsonError("Origem inválida.", 403);
  let input;
  try {
    const body = await request.text();
    if (body.length > 100000) return jsonError("Registo demasiado grande.", 413);
    input = JSON.parse(body);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Registo inválido.", 400);
  }
  const store = new CatalogStore();
  try {
    return Response.json(await store.save(input), { headers: noStoreHeaders });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Não foi possível guardar.",
      e instanceof CatalogConflict
        ? 409
        : e instanceof PortalPythonError && e.code !== "CATALOG_INVALID"
          ? 503
          : 400,
    );
  }
}
