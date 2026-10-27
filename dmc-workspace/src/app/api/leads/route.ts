import { LeadsNotConfigured, listLeads } from "@/lib/leads";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
import {
  IdentityConfigurationError,
  IdentityDenied,
  IdentityRequired,
  requestPrincipal,
  requirePermission,
} from "@/lib/server-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filter =
    new URL(request.url).searchParams.get("status") === "contacted" ? "contacted" : "open";
  try {
    const principal = await requestPrincipal(request);
    if (principal) requirePermission(principal, "leads.read");
    return Response.json(await listLeads(filter), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof IdentityRequired) return jsonError(error.message, 401, noStoreHeaders);
    if (error instanceof IdentityDenied) return jsonError(error.message, 403, noStoreHeaders);
    if (error instanceof IdentityConfigurationError)
      return jsonError(error.message, 503, noStoreHeaders);
    if (error instanceof LeadsNotConfigured) return jsonError(error.message, 503, noStoreHeaders);
    console.error("Leads list failed", error instanceof Error ? error.name : error);
    return jsonError(
      "Não foi possível carregar os contactos. Tente novamente mais tarde.",
      502,
      noStoreHeaders,
    );
  }
}
