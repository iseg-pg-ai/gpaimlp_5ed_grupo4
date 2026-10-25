import { recordOperationalEvent, type OperationalEvent } from "@/lib/operational-telemetry";

export const runtime = "nodejs";

const levels = new Set(["info", "warning", "error", "critical"]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_192) return Response.json({ error: "Evento demasiado grande." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  const required = ["component", "operation", "outcome", "module"];
  if (required.some((key) => typeof body[key] !== "string"))
    return Response.json({ error: "Evento incompleto." }, { status: 400 });
  const event: OperationalEvent = {
    component: String(body.component),
    operation: String(body.operation),
    outcome: String(body.outcome),
    module: String(body.module),
    user: typeof body.user === "string" ? body.user : "browser-session",
    level: levels.has(String(body.level))
      ? (String(body.level) as OperationalEvent["level"])
      : undefined,
    details: typeof body.details === "string" ? body.details : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    stack: typeof body.stack === "string" ? body.stack : undefined,
    httpStatus: typeof body.httpStatus === "number" ? body.httpStatus : undefined,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
  };
  await recordOperationalEvent(event);
  return new Response(null, { status: 204 });
}
