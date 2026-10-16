import { readOperations } from "@/lib/assistant-operations";
import { FeedbackStore } from "@/lib/feedback-store";
import { HistoricalCases } from "@/lib/historical-cases";
import { VersionStore, VersionConflict } from "@/lib/version-store";
import { CatalogStore, CatalogConflict } from "@/lib/catalog-store";
import { jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import { authorizeOperations } from "@/lib/operations-auth";
import { prepareCommunication } from "@/lib/assistant-communication";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = authorizeOperations(request);
  if (auth instanceof Response) return auth;
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      await readOperations(
        params.get("tripId") || undefined,
        Number(params.get("version")) || undefined,
        params.get("query") ?? "",
        Number(params.get("compareVersion")) || undefined,
        params.get("locale") ?? "pt",
        params.get("weather") === "1",
      ),
      { headers: noStoreHeaders },
    );
  } catch {
    return jsonError(
      "Não foi possível carregar a operação. Verifique a versão, o catálogo e os parâmetros.",
      503,
      noStoreHeaders,
    );
  }
}
export async function POST(request: Request) {
  const auth = authorizeOperations(request);
  if (auth instanceof Response) return auth;
  if (request.headers.get("origin") && request.headers.get("origin") !== publicOrigin(request.url))
    return jsonError("Origem inválida.", 403);
  const store = new VersionStore();
  try {
    const raw = await request.text();
    if (raw.length > 1000000) return jsonError("Pedido demasiado grande.", 413);
    const body = JSON.parse(raw);
    const operator = auth.operator;
    if (body.confirm !== true) throw new Error("Reveja e confirme explicitamente a operação.");
    const feedback = new FeedbackStore(store);
    if (body.action === "communication")
      return Response.json(
        await prepareCommunication(
          feedback.snapshot(body.tripId, body.version),
          body.locale,
          body.kind ?? "client",
        ),
        { headers: noStoreHeaders },
      );
    if (body.action === "complete") feedback.complete(body.tripId, body.version, operator);
    else if (body.action === "feedback")
      feedback.submit(body.tripId, body.version, { ...body.feedback, operator });
    else if (body.action === "approve-case")
      new HistoricalCases(feedback).approve(body.tripId, body.version, operator);
    else if (body.action === "catalog-decision") {
      if (
        !["keep", "review", "inactive"].includes(body.decision) ||
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        body.reason.length > 500
      )
        throw new Error("Decisão ou motivo inválido.");
      const catalog = new CatalogStore();
      const record = (await catalog.list()).find((record) => record.id === body.catalogId);
      if (!record || record.revision !== body.baseRevision)
        throw new VersionConflict("O registo mudou. Atualize antes de decidir.");
      if (body.decision !== "keep")
        await catalog.save({
          id: record.id,
          category: record.category,
          status: body.decision,
          baseRevision: record.revision,
          fields: record.fields,
          operational: record.operational,
          sourceData: record.sourceData,
          subcategory: record.subcategory,
          pricing: record.pricing,
          matching: record.matching,
          reason: body.reason,
        });
      store.db
        .prepare(
          "INSERT INTO quality_decisions(catalogId,operator,decision,reason,createdAt) VALUES(?,?,?,?,?)",
        )
        .run(record.id, operator, body.decision, body.reason, new Date().toISOString());
    } else throw new Error("Operação desconhecida.");
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    return jsonError(
      error instanceof VersionConflict || error instanceof CatalogConflict
        ? error.message
        : error instanceof Error && !("code" in error)
          ? error.message
          : "A operação não foi concluída.",
      error instanceof VersionConflict || error instanceof CatalogConflict ? 409 : 400,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
