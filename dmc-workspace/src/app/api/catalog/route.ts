import { sourceEnricher } from "@/lib/dataset-source";
import { CatalogStore, CatalogConflict, warehouseRoot } from "@/lib/catalog-store";
import { validateCatalogInput, categories } from "@/lib/catalog-schema";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jsonError, noStoreHeaders } from "@/lib/api-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const store = new CatalogStore();
  try {
    store.importWarehouse();
    const id = new URL(request.url).searchParams.get("id");
    if (id) return Response.json(store.history(id), { headers: noStoreHeaders });
    const published = new Map<string, number>();
    for (const category of categories) {
      for (const line of readFileSync(path.join(warehouseRoot(), `${category}.jsonl`), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)) {
        const row = JSON.parse(line);
        if (row._catalog_status === "approved")
          published.set(row._catalog_id, row._catalog_revision);
      }
    }
    const enrich = sourceEnricher(warehouseRoot());
    return Response.json(
      store
        .list()
        .map(enrich)
        .map((record) => ({
          ...record,
          published: record.status === "approved" && published.get(record.id) === record.revision,
        })),
      { headers: noStoreHeaders },
    );
  } catch {
    return jsonError(
      "Não foi possível ler o catálogo. Verifique o warehouse e execute o ETL inicial.",
      503,
    );
  } finally {
    store.close();
  }
}
export async function POST(request: Request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return jsonError("Origem inválida.", 403);
  let input;
  try {
    const body = await request.text();
    if (body.length > 100000) return jsonError("Registo demasiado grande.", 413);
    input = JSON.parse(body);
    validateCatalogInput(input);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Registo inválido.", 400);
  }
  const store = new CatalogStore();
  try {
    return Response.json(store.save(input), { headers: noStoreHeaders });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Não foi possível guardar.",
      e instanceof CatalogConflict ? 409 : 400,
    );
  } finally {
    store.close();
  }
}
