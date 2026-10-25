import { LeadsNotConfigured, listLeads } from "@/lib/leads";
import { jsonError, noStoreHeaders } from "@/lib/server-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filter =
    new URL(request.url).searchParams.get("status") === "contacted" ? "contacted" : "open";
  try {
    return Response.json(await listLeads(filter), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof LeadsNotConfigured) return jsonError(error.message, 503, noStoreHeaders);
    console.error("Leads list failed", error instanceof Error ? error.name : error);
    return jsonError(
      "Não foi possível ler os contactos na AWS. Verifique as credenciais.",
      502,
      noStoreHeaders,
    );
  }
}
