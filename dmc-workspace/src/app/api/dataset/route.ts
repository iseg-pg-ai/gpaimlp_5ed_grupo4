// Endpoint: disponibiliza consultas do dataset através da fronteira Node/Python.
import { PortalPythonError, queryDataset } from "@/lib/python-portal";
import { warehouseRoot } from "@/lib/catalog-store";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const params = Object.fromEntries([...search.keys()].map((key) => [key, search.get(key)]));
    return Response.json(await queryDataset(warehouseRoot(), params), { headers: noStoreHeaders });
  } catch (error) {
    return jsonError(
      error instanceof PortalPythonError ? error.message : "Dataset indisponível. Execute o ETL.",
      error instanceof PortalPythonError && error.code === "UNKNOWN_TABLE" ? 400 : 503,
    );
  }
}
