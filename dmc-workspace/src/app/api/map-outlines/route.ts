import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonError } from "@/lib/server-http";

export const runtime = "nodejs";

// Contorno da região (Natural Earth, domínio público): o mesmo ficheiro que o Observatório
// usa, sem dados de clientes, por isso pode ficar em cache no navegador.
export async function GET() {
  try {
    const region = JSON.parse(
      await readFile(path.resolve(process.cwd(), "../dashboard/region.geojson"), "utf8"),
    ) as { features: { geometry: { type: string; coordinates: unknown } }[] };
    const outlines = region.features.flatMap(({ geometry }) => {
      const polygons = (
        geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
      ) as number[][][][];
      return polygons.filter((polygon) => polygon?.length).map((polygon) => polygon[0]);
    });
    return Response.json(outlines, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return jsonError("O contorno do mapa está indisponível.", 503);
  }
}
