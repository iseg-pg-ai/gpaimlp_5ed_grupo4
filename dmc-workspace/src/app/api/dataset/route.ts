import { DatasetError, queryDataset } from "@/lib/dataset-source";
import { warehouseRoot } from "@/lib/catalog-store";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await queryDataset(warehouseRoot(), params), { headers: noStoreHeaders });
  } catch (error) {
    return jsonError(
      error instanceof DatasetError ? error.message : "Dataset indisponível. Execute o ETL.",
      error instanceof DatasetError && error.code === "UNKNOWN_TABLE" ? 400 : 503,
    );
  }
}
