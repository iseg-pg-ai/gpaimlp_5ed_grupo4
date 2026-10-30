// Endpoint: as duas propostas guardadas que melhor servem um lead (pontuação determinística).
import { emptyBrief } from "@/data/initialBrief";
import { leadToBrief } from "@/lib/lead-brief";
import { getLead, LeadNotFound, LeadsNotConfigured } from "@/lib/leads";
import { validLeadId } from "@/lib/leads-model";
import { rankProposals, type MatchCandidate } from "@/lib/proposal-match";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
import { requestPrincipal, requirePermission } from "@/lib/server-principal";
import { VersionStore } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validLeadId(id)) return jsonError("Referência inválida.", 400, noStoreHeaders);
  try {
    const principal = await requestPrincipal(request);
    if (principal) requirePermission(principal, "leads.read");
    const lead = await getLead(id);
    const wanted = leadToBrief(lead, emptyBrief(), new Date().toISOString().slice(0, 10)).brief;
    const store = new VersionStore();
    try {
      // A versão mais recente de cada viagem (as apagadas já não vêm na lista).
      const latest = new Map<string, number>();
      for (const record of store.list().slice(0, 500))
        latest.set(record.tripId, Math.max(latest.get(record.tripId) ?? 0, record.version));
      const candidates: MatchCandidate[] = [];
      for (const [tripId, version] of [...latest].slice(0, 200)) {
        const brief = JSON.parse(store.get(tripId, version).snapshot)?.brief;
        if (brief) candidates.push({ tripId, version, brief });
      }
      return Response.json(
        { matches: rankProposals(id, wanted, candidates) },
        { headers: noStoreHeaders },
      );
    } finally {
      store.close();
    }
  } catch (error) {
    if (error instanceof LeadNotFound) return jsonError(error.message, 404, noStoreHeaders);
    if (error instanceof LeadsNotConfigured) return jsonError(error.message, 503, noStoreHeaders);
    const name = error instanceof Error ? error.name : "";
    const status = name === "IdentityRequired" ? 401 : name === "IdentityDenied" ? 403 : 502;
    console.error("Proposal matching failed", name);
    return jsonError("Não foi possível propor propostas.", status, noStoreHeaders);
  }
}
