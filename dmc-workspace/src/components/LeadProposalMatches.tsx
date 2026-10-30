// Propostas já guardadas que servem este lead (até duas): o curador escolhe e abre os rascunhos
// no WhatsApp da Mission Control. Nada é enviado ao cliente a partir daqui.
"use client";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { portalFetch } from "@/lib/http-client";
import { T } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { ProposalMatch } from "@/lib/proposal-match";

// Endereço da Mission Control, fixado no build; sem ele, o botão não aparece.
const missionControlUrl = process.env.NEXT_PUBLIC_INTRANET_URL ?? "";

export function LeadProposalMatches({ leadId }: { leadId: string }) {
  const [matches, setMatches] = useState<ProposalMatch[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setMatches(null);
    portalFetch(`/api/leads/${encodeURIComponent(leadId)}/proposals`)
      .then((response) => (response.ok ? response.json() : { matches: [] }))
      .then(
        (payload: { matches?: ProposalMatch[] }) => current && setMatches(payload.matches ?? []),
      )
      .catch(() => current && setMatches([]));
    return () => {
      current = false;
    };
  }, [leadId]);

  if (!matches?.length) return null;

  // Cada proposta ganha uma ligação com prazo (a partilha existente, 30 dias); o fragmento (#)
  // leva-as à Mission Control sem passar pelos servidores.
  const prepare = async () => {
    setBusy(true);
    setError("");
    try {
      const drafts = [];
      for (const match of matches) {
        const response = await portalFetch("/api/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId: match.tripId,
            version: match.version,
            locale: "en",
            method: "link",
            recipient: "whatsapp",
            retentionDays: 30,
            consent,
          }),
        });
        const share = (await response.json()) as { shareUrl?: string; error?: string };
        if (!response.ok || !share.shareUrl)
          throw new Error(share.error || "Não foi possível preparar a partilha.");
        drafts.push({
          link: share.shareUrl,
          v: match.version,
          dest: match.destination,
          score: match.score,
          why: match.reasons,
        });
      }
      const query = new URLSearchParams({ lead: leadId, d: JSON.stringify(drafts) });
      window.open(
        `${missionControlUrl.replace(/\/+$/, "")}/#whatsapp?${query}`,
        "_blank",
        "noopener",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível preparar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Propostas parecidas"
      className="mt-3 rounded-lg border border-[var(--portal-line-d5d1c7)] p-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle aria-hidden="true" className="size-4" />
        <T text="Propostas guardadas que servem este cliente" source="pt" />
      </h3>
      <ol className="mt-2 space-y-2 text-sm">
        {matches.map((match) => (
          <li key={`${match.tripId}-${match.version}`}>
            <strong>
              {match.destination} · v{String(match.version).padStart(3, "0")}
            </strong>{" "}
            <span className="text-xs">({match.score}%)</span>
            <div className="text-xs opacity-80">{match.reasons.join(" · ")}</div>
          </li>
        ))}
      </ol>
      {missionControlUrl && (
        <>
          <label className="mt-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              <T
                text="O cliente autorizou receber estas propostas. Os rascunhos só abrem na Mission Control; uma pessoa escolhe e envia."
                source="pt"
              />
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-800">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="primaryDark"
            className="mt-3"
            disabled={busy || !consent}
            onClick={prepare}
          >
            <MessageCircle className="size-4" />
            {busy ? "A preparar…" : "Abrir os rascunhos no WhatsApp"}
          </Button>
        </>
      )}
    </section>
  );
}
