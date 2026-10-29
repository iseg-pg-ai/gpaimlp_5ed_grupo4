// Endpoint: consulta e atualiza um Lead autorizado, mantendo o acesso DynamoDB no servidor.
import { LeadNotFound, LeadsNotConfigured, getLead, markContacted, tagLead } from "@/lib/leads";
import { validLeadId } from "@/lib/leads-model";
import { jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import {
  IdentityConfigurationError,
  IdentityDenied,
  IdentityRequired,
  requestPrincipal,
  requirePermission,
} from "@/lib/server-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof IdentityRequired) return jsonError(error.message, 401, noStoreHeaders);
  if (error instanceof IdentityDenied) return jsonError(error.message, 403, noStoreHeaders);
  if (error instanceof IdentityConfigurationError)
    return jsonError(error.message, 503, noStoreHeaders);
  if (error instanceof LeadsNotConfigured) return jsonError(error.message, 503, noStoreHeaders);
  if (error instanceof LeadNotFound) return jsonError(error.message, 404, noStoreHeaders);
  // Não registar o conteúdo: as conversas contêm dados pessoais.
  console.error("Lead request failed", error instanceof Error ? error.name : error);
  return jsonError(
    "Não foi possível contactar a AWS. Verifique as credenciais.",
    502,
    noStoreHeaders,
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validLeadId(id)) return jsonError("Referência inválida.", 400, noStoreHeaders);
  try {
    const principal = await requestPrincipal(request);
    if (principal) requirePermission(principal, "leads.read");
    return Response.json(await getLead(id), { headers: noStoreHeaders });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") && request.headers.get("origin") !== publicOrigin(request.url))
    return jsonError("Origem inválida.", 403);
  const { id } = await context.params;
  if (!validLeadId(id)) return jsonError("Referência inválida.", 400, noStoreHeaders);
  try {
    const principal = await requestPrincipal(request);
    if (principal) requirePermission(principal, "leads.manage");
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      tags?: unknown;
      note?: unknown;
    };
    if (body.action === "contacted") await markContacted(id);
    else if (body.action === "tag") await tagLead(id, body.tags, body.note);
    else return jsonError("Ação desconhecida.", 400, noStoreHeaders);
    return Response.json(await getLead(id), { headers: noStoreHeaders });
  } catch (error) {
    return failure(error);
  }
}
