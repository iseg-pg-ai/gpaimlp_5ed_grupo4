// Recolhe os parâmetros de partilha e deixa a validação do acesso ao servidor.
"use client";
import { portalFetch } from "@/lib/http-client";

import { useState } from "react";
import { Copy, Mail, MessageCircle, Share2, X } from "lucide-react";
import { LanguagePicker, T } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { languages, type Locale } from "@/lib/locales";

// Endereço da Mission Control (intranet), fixado no build; sem ele, o botão de WhatsApp não aparece.
const missionControlUrl = process.env.NEXT_PUBLIC_INTRANET_URL ?? "";

type ShareResult = { shareUrl: string; recipient: string; expiresAt: string };

export function ShareProposalModal({
  tripId,
  currentVersion,
  versions,
  defaultLocale,
  defaultEmail,
  defaultMethod = "link",
  customerName,
  destination,
  leadId,
  onClose,
}: {
  tripId: string;
  currentVersion: number;
  versions: Array<{ version: number; createdAt: string }>;
  defaultLocale: Locale;
  defaultEmail?: string;
  defaultMethod?: "document" | "link";
  customerName: string;
  destination: string;
  leadId?: string;
  onClose: () => void;
}) {
  const available = [
    ...new Map(
      [{ version: currentVersion, createdAt: "" }, ...versions].map((v) => [v.version, v]),
    ).values(),
  ].sort((a, b) => b.version - a.version);
  const [version, setVersion] = useState(currentVersion);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [method, setMethod] = useState<"document" | "link">(defaultMethod);
  const [recipient, setRecipient] = useState(defaultEmail ?? "");
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90>(30);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ShareResult | null>(null);

  const openEmail = (share: ShareResult) => {
    const language = languages.find((item) => item.code === locale)?.name ?? locale;
    const subject = `BLU — ${destination} — v${String(version).padStart(3, "0")}`;
    const access = method === "document" ? "documento PDF" : "proposta";
    const body = `Olá ${customerName},\n\nPode consultar o ${access} da sua viagem a ${destination}, versão ${String(version).padStart(3, "0")}, em ${language}:\n\n${share.shareUrl}\n\nCom os melhores cumprimentos,\nBLU Costa Travel`;
    const anchor = document.createElement("a");
    anchor.href = `mailto:${encodeURIComponent(share.recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    anchor.click();
  };

  // O fragmento (#) fica no navegador: o link da proposta não passa pelos servidores da intranet.
  const openMissionControl = (share: ShareResult) => {
    const query = new URLSearchParams({
      link: share.shareUrl,
      v: String(version),
      dest: destination,
      ...(leadId ? { lead: leadId } : {}),
    });
    window.location.assign(`${missionControlUrl.replace(/\/+$/, "")}/#whatsapp?${query}`);
  };

  const prepareShare = async (event: React.FormEvent) => {
    event.preventDefault();
    const whatsapp =
      Boolean(missionControlUrl) &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-channel") === "whatsapp";
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await portalFetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          version,
          locale,
          method,
          recipient: whatsapp ? "whatsapp" : recipient,
          retentionDays,
          consent,
        }),
      });
      const payload = (await response.json()) as ShareResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível preparar a partilha.");
      setResult(payload);
      await navigator.clipboard?.writeText(payload.shareUrl).catch(() => undefined);
      if (whatsapp) openMissionControl(payload);
      else openEmail(payload);
    } catch (shareError) {
      setError(
        shareError instanceof Error ? shareError.message : "Não foi possível preparar a partilha.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--portal-line-d5d1c7)] bg-[var(--portal-bg-faf8f3)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--portal-line-ddd8ce)] bg-[var(--portal-white)] p-5">
          <div className="flex items-center gap-3">
            <Share2 className="size-5 text-[var(--portal-text-896225)]" />
            <div>
              <h2
                id="share-title"
                className="font-serif-blu text-xl font-bold text-[var(--portal-text-143f4b)]"
              >
                <T text="Partilhar proposta" source="pt" />
              </h2>
              <p className="text-sm text-[var(--portal-text-4a636b)]">{customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-2 hover:bg-[var(--portal-bg-f4f0e7)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={prepareShare} className="space-y-5 p-5">
          <label className="block text-sm font-medium text-[var(--portal-text-143f4b)]">
            <T text="Email do destinatário" source="pt" />
            <Input
              name="recipientEmail"
              className="mt-1.5 h-11 text-sm"
              type="email"
              required={!missionControlUrl}
              autoFocus
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="cliente@example.com"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-[var(--portal-text-143f4b)]">
              <T text="Versão" source="pt" />
              <select
                name="proposalVersion"
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--portal-line-dfd9ce)] bg-[var(--portal-white)] px-3 text-sm"
                value={version}
                onChange={(event) => setVersion(Number(event.target.value))}
              >
                {available.map((item) => (
                  <option key={item.version} value={item.version}>
                    Versão {String(item.version).padStart(3, "0")}
                    {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm font-medium text-[var(--portal-text-143f4b)]">
              <T text="Idioma a partilhar" source="pt" />
              <div className="mt-1.5">
                <LanguagePicker value={locale} onChange={setLocale} />
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[var(--portal-text-143f4b)]">
              <T text="Forma de partilha" source="pt" />
            </legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["link", "Ligação de acesso", "Página da proposta com acesso ao PDF."],
                  ["document", "Documento PDF", "Ligação que abre diretamente o PDF."],
                ] as const
              ).map(([value, title, description]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border p-4 ${method === value ? "border-[var(--portal-line-143f4b)] bg-[var(--portal-white)] ring-1 ring-[var(--portal-line-143f4b)]" : "border-[var(--portal-line-ddd8ce)]"}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="share-method"
                      value={value}
                      checked={method === value}
                      onChange={() => setMethod(value)}
                    />
                    <T text={title} source="pt" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--portal-text-4a636b)]">
                    <T text={description} source="pt" />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm font-medium text-[var(--portal-text-143f4b)]">
            Prazo de acesso
            <select
              name="shareRetention"
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--portal-line-dfd9ce)] bg-[var(--portal-white)] px-3 text-sm"
              value={retentionDays}
              onChange={(event) => setRetentionDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-[var(--portal-line-ddd8ce)] p-3 text-sm leading-5">
            <input
              className="mt-1"
              type="checkbox"
              name="shareConsent"
              required
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Confirmo que o destinatário autorizou esta partilha e que o email, a versão e o prazo
              acima estão corretos.
            </span>
          </label>

          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <T
              text="O portal prepara a mensagem no programa de email deste computador. Confirme o envio nessa aplicação. Para acesso fora da rede local, configure BLU_PUBLIC_URL com o endereço público do portal."
              source="pt"
            />
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {result && (
            <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">
                Partilha preparada. Abra o canal escolhido e confirme o envio.
              </p>
              <p className="mt-1 text-xs">
                Acesso válido até {new Date(result.expiresAt).toLocaleString()}.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline"
                  onClick={() => navigator.clipboard.writeText(result.shareUrl)}
                >
                  <Copy className="size-4" /> Copiar ligação
                </button>
                {missionControlUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 underline"
                    onClick={() => openMissionControl(result)}
                  >
                    <MessageCircle className="size-4" /> Abrir no WhatsApp (Mission Control)
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline"
                  onClick={() => openEmail(result)}
                >
                  <Mail className="size-4" /> Abrir email novamente
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--portal-line-ddd8ce)] pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primaryDark" disabled={busy}>
              <Mail className="size-4" />
              {busy ? "A preparar…" : "Preparar email"}
            </Button>
            {missionControlUrl && (
              <Button
                type="submit"
                variant="primaryDark"
                disabled={busy || !consent}
                data-channel="whatsapp"
                formNoValidate
              >
                <MessageCircle className="size-4" />
                Enviar por WhatsApp (Mission Control)
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
