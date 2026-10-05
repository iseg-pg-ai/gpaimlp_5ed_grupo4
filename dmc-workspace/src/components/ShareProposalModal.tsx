"use client";

import { useState } from "react";
import { Copy, Mail, Share2, X } from "lucide-react";
import { LanguagePicker, T } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { languages, type Locale } from "@/lib/locales";

type ShareResult = { shareUrl: string; recipient: string };

export function ShareProposalModal({
  tripId,
  currentVersion,
  versions,
  defaultLocale,
  defaultEmail,
  customerName,
  destination,
  onClose,
}: {
  tripId: string;
  currentVersion: number;
  versions: Array<{ version: number; createdAt: string }>;
  defaultLocale: Locale;
  defaultEmail?: string;
  customerName: string;
  destination: string;
  onClose: () => void;
}) {
  const available = [
    ...new Map(
      [{ version: currentVersion, createdAt: "" }, ...versions].map((v) => [v.version, v]),
    ).values(),
  ].sort((a, b) => b.version - a.version);
  const [version, setVersion] = useState(currentVersion);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [method, setMethod] = useState<"document" | "link">("link");
  const [recipient, setRecipient] = useState(defaultEmail ?? "");
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

  const prepareShare = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, version, locale, method, recipient }),
      });
      const payload = (await response.json()) as ShareResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível preparar a partilha.");
      setResult(payload);
      await navigator.clipboard?.writeText(payload.shareUrl).catch(() => undefined);
      openEmail(payload);
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
        className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#D5D1C7] bg-[#FAF8F3] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[#DDD8CE] bg-white p-5">
          <div className="flex items-center gap-3">
            <Share2 className="size-5 text-[#896225]" />
            <div>
              <h2 id="share-title" className="font-serif-blu text-xl font-bold text-[#143F4B]">
                <T text="Partilhar proposta" source="pt" />
              </h2>
              <p className="text-sm text-[#4A636B]">{customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-2 hover:bg-[#F4F0E7]"
          >
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={prepareShare} className="space-y-5 p-5">
          <label className="block text-sm font-medium text-[#143F4B]">
            <T text="Email do destinatário" source="pt" />
            <Input
              className="mt-1.5 h-11 text-sm"
              type="email"
              required
              autoFocus
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="cliente@example.com"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#143F4B]">
              <T text="Versão" source="pt" />
              <select
                className="mt-1.5 h-11 w-full rounded-lg border border-[#DFD9CE] bg-white px-3 text-sm"
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
            <div className="text-sm font-medium text-[#143F4B]">
              <T text="Idioma a partilhar" source="pt" />
              <div className="mt-1.5">
                <LanguagePicker value={locale} onChange={setLocale} />
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[#143F4B]">
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
                  className={`cursor-pointer rounded-xl border p-4 ${method === value ? "border-[#143F4B] bg-white ring-1 ring-[#143F4B]" : "border-[#DDD8CE]"}`}
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
                  <span className="mt-1 block text-xs leading-5 text-[#4A636B]">
                    <T text={description} source="pt" />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

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
                Partilha preparada. Confirme o envio no programa de email.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline"
                  onClick={() => navigator.clipboard.writeText(result.shareUrl)}
                >
                  <Copy className="size-4" /> Copiar ligação
                </button>
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

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#DDD8CE] pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primaryDark" disabled={busy}>
              <Mail className="size-4" />
              {busy ? "A preparar…" : "Preparar email"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
