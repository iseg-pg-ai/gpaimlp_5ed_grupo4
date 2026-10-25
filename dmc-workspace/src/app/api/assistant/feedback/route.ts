import { FeedbackInputError, FeedbackStore } from "@/lib/feedback-store";
import { HistoricalCaseStore } from "@/lib/historical-cases";
import { syncOperationalState } from "@/lib/operational-s3";
import { jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import {
  IdentityConfigurationError,
  IdentityDenied,
  IdentityRequired,
  requestPrincipal,
  requirePermission,
} from "@/lib/server-principal";
import { VersionConflict, VersionStore, checkTripId } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function identityError(error: unknown) {
  if (error instanceof IdentityRequired) return jsonError("Autenticação necessária.", 401);
  if (error instanceof IdentityDenied) return jsonError("Permissão insuficiente.", 403);
  if (error instanceof IdentityConfigurationError)
    return jsonError("Identidade indisponível.", 503);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tripId = params.get("tripId") ?? "";
  const version = Number(params.get("version"));
  try {
    checkTripId(tripId);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error();
    const principal = await requestPrincipal(request);
    if (principal) requirePermission(principal, "trip.read");
  } catch (error) {
    const response = identityError(error);
    if (response) return response;
    return jsonError("Pedido inválido.", 400);
  }
  const store = new VersionStore();
  try {
    const feedback = new FeedbackStore(store);
    const snapshot = feedback.snapshot(tripId, version);
    const record = feedback
      .list()
      .find((item) => item.tripId === tripId && item.version === version);
    return Response.json(
      {
        record: record ?? null,
        cards: snapshot.itinerary.flatMap((day) =>
          day.items.map((item) => ({
            dayNumber: day.dayNumber,
            itemId: item.id,
            title: item.title,
            time: item.time,
          })),
        ),
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return jsonError("Versão não encontrada.", 404);
  } finally {
    store.close();
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== publicOrigin(request.url)) return jsonError("Origem inválida.", 403);
  let body: Record<string, unknown>;
  let principal;
  try {
    const raw = await request.text();
    if (raw.length > 200000) return jsonError("Pedido demasiado grande.", 413);
    body = JSON.parse(raw);
    if (typeof body.tripId !== "string") throw new Error();
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) throw new Error();
    if (!["start", "submit", "approve"].includes(String(body.action))) throw new Error();
    principal = await requestPrincipal(request);
    if (principal)
      requirePermission(principal, body.action === "approve" ? "catalog.edit" : "trip.edit_shared");
  } catch (error) {
    const response = identityError(error);
    if (response) return response;
    return jsonError("Pedido inválido.", 400);
  }
  const tripId = String(body.tripId);
  const version = Number(body.version);
  const store = new VersionStore();
  try {
    const feedback = new FeedbackStore(store);
    const cases = new HistoricalCaseStore(feedback);
    const actor = principal?.id ?? (body.action === "approve" ? "local:admin" : "local:curator");
    let result;
    if (body.action === "start") {
      feedback.complete(tripId, version, actor);
      result = { status: "pending" };
    } else if (body.action === "submit") {
      feedback.submit(tripId, version, body.feedback as never, actor);
      result = { status: "submitted" };
    } else result = { status: "approved", case: cases.approve(tripId, version, actor) };
    await syncOperationalState();
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    const known = error instanceof VersionConflict || error instanceof FeedbackInputError;
    return jsonError(
      known ? error.message : "Não foi possível registar o feedback.",
      error instanceof VersionConflict ? 409 : error instanceof FeedbackInputError ? 400 : 500,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
