"use client";

import { T } from "@/components/LocaleProvider";
import { useState } from "react";
import { Ban, Link2 } from "lucide-react";
import { portalFetch } from "@/lib/http-client";

type ShareAccess = {
  token: string;
  tripId: string;
  version: number;
  recipient: string;
  locale: string;
  method: "document" | "link";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
};

export function ShareAccessManager({ initialShares }: { initialShares: ShareAccess[] }) {
  const [shares, setShares] = useState(initialShares);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const revoke = async (token: string) => {
    setBusy(token);
    setError("");
    try {
      const response = await portalFetch("/api/shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as ShareAccess & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível revogar a partilha.");
      setShares((current) => current.map((share) => (share.token === token ? payload : share)));
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Não foi possível revogar a partilha.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!shares.length) return null;
  return (
    <section className="mb-8 rounded-2xl border border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)] p-5">
      <div className="flex items-center gap-2">
        <Link2 className="size-5 text-[var(--portal-text-896225)]" />
        <h2 className="font-serif-blu text-xl font-bold">Acessos partilhados</h2>
      </div>
      <p className="mt-2 text-sm text-[var(--portal-text-4a636b)]">
        As ligações expiram automaticamente. Enviar uma versão para o Lixo revoga os respetivos
        acessos e o restauro não os reativa.
      </p>
      {error && <p className="mt-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 grid gap-3">
        {shares.map((share) => {
          const expiresAt = share.expiresAt;
          const expired = !expiresAt || expiresAt <= new Date().toISOString();
          const inactive = Boolean(share.revokedAt) || expired;
          return (
            <article
              key={share.token}
              className="flex flex-col gap-3 rounded-xl border border-[var(--portal-line-e6e1d5)] p-4 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-all font-semibold">{share.recipient}</p>
                <p className="mt-1 text-[var(--portal-text-4a636b)]">
                  <T text="Versão" source="pt" /> v{String(share.version).padStart(3, "0")} ·{" "}
                  {share.locale.toUpperCase()} · {share.method === "document" ? "PDF" : "página"}
                </p>
                <p className="mt-1 text-xs text-[var(--portal-text-6a8288)]">
                  {inactive
                    ? share.revokedAt
                      ? `Revogada em ${new Date(share.revokedAt).toLocaleString()}`
                      : expiresAt
                        ? `Expirou em ${new Date(expiresAt).toLocaleString()}`
                        : "Partilha antiga sem prazo; acesso desativado"
                    : `Expira em ${new Date(expiresAt!).toLocaleString()}`}
                </p>
              </div>
              <button
                type="button"
                disabled={inactive || busy === share.token}
                onClick={() => revoke(share.token)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--portal-line-d5d1c7)] px-3 py-2 text-sm text-[var(--portal-text-70443e)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ban className="size-4" />
                {inactive ? "Sem acesso" : busy === share.token ? "A revogar…" : "Revogar acesso"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
