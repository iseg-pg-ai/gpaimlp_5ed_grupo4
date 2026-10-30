// Apresenta e acompanha Leads através das APIs do servidor, sem expor credenciais AWS ao
// navegador.
"use client";
import { portalFetch } from "@/lib/http-client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Mail, MessageCircle, RefreshCw, Save, Tag } from "lucide-react";
import { T, useLocale } from "@/components/LocaleProvider";
import { emptyBrief } from "@/data/initialBrief";
import { LEAD_DRAFT_STORAGE, leadToBrief } from "@/lib/lead-brief";
import {
  isOverdue,
  journeyLabels,
  LEAD_TAGS,
  NOTE_LIMIT,
  stageText,
  type Lead,
  type LeadDetail,
  type LeadFilter,
  validLeadId,
} from "@/lib/leads-model";

async function readJson<Value>(response: Response): Promise<Value> {
  const result = (await response.json()) as Value | { error?: string };
  if (!response.ok)
    throw new Error((result as { error?: string }).error ?? "Erro ao contactar o servidor.");
  return result as Value;
}

const statusText: Record<string, string> = {
  PENDING: "Por contactar",
  QUEUED_FOR_REVIEW: "Em revisão",
  CONTACTED: "Contactado",
};

export default function LeadsPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<LeadFilter>("open");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const show = (detail: LeadDetail) => {
    setSelected(detail);
    setDraftTags(detail.tags);
    setDraftNote(detail.curatorNote ?? "");
  };
  const [error, setError] = useState("");
  const when = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";

  const load = useCallback(async (current: LeadFilter) => {
    setLoading(true);
    setError("");
    try {
      const response = await portalFetch(`/api/leads?status=${current}`, { cache: "no-store" });
      setLeads(await readJson<Lead[]>(response));
    } catch (loadError) {
      setLeads([]);
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar contactos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(filter));
  }, [filter, load]);

  const open = async (id: string) => {
    setError("");
    try {
      const response = await portalFetch(`/api/leads/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      show(await readJson<LeadDetail>(response));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Erro ao abrir o contacto.");
    }
  };

  // Ligação direta da intranet (/leads?lead=BLU-…): abre logo esse contacto.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead") ?? "";
    if (validLeadId(id)) queueMicrotask(() => void open(id));
    // Só no primeiro carregamento: depois a escolha é feita na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markContacted = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await portalFetch(`/api/leads/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contacted" }),
      });
      show(await readJson<LeadDetail>(response));
      await load(filter);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  };

  const saveTags = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await portalFetch(`/api/leads/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tag", tags: draftTags, note: draftNote }),
      });
      show(await readJson<LeadDetail>(response));
      await load(filter);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  };
  const tagsChanged =
    !!selected &&
    (draftNote.trim() !== (selected.curatorNote ?? "") ||
      draftTags.length !== selected.tags.length ||
      draftTags.some((tag) => !selected.tags.includes(tag)));

  return (
    <main className="portal-page min-h-full bg-[var(--portal-bg-f4f0e7)] text-[var(--portal-text-143f4b)]">
      <Link href="/" className="underline">
        <T text="Voltar ao workspace" source="pt" />
      </Link>
      <div className="mt-6 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">
            <T text="Contactos e seguimento" source="pt" />
          </h1>
          <p className="mt-1 max-w-2xl text-sm opacity-80">
            <T
              text="Conversas do site e do WhatsApp em que o visitante autorizou o contacto de um curador. O seguimento vence três dias após a última mensagem."
              source="pt"
            />
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Filtro">
          {(["open", "contacted"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setSelected(null);
                setFilter(value);
              }}
              className={`min-h-11 rounded-lg border px-3 text-sm ${filter === value ? "bg-[var(--portal-bg-143f4b)] text-white" : "border-[var(--portal-line-d5d1c7)]"}`}
            >
              <T text={value === "open" ? "Por tratar" : "Contactados"} source="pt" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load(filter)}
            aria-label="Atualizar"
            className="min-h-11 rounded-lg border border-[var(--portal-line-d5d1c7)] px-3"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-amber-700/40 bg-amber-50 p-3 text-amber-900"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Lista de contactos" className="min-w-0">
          {!loading && !leads.length && !error && (
            <p className="rounded-lg border border-dashed border-[var(--portal-line-d5d1c7)] p-6 text-sm">
              <T text="Sem contactos neste estado." source="pt" />
            </p>
          )}
          <ul className="grid gap-2">
            {leads.map((lead) => {
              const overdue = isOverdue(lead);
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => void open(lead.id)}
                    aria-current={selected?.id === lead.id ? "true" : undefined}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === lead.id ? "border-[var(--portal-text-143f4b)] bg-[var(--portal-bg-e3dcd0)]" : "border-[var(--portal-line-d5d1c7)] hover:bg-[var(--portal-bg-e3dcd0)]"}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">
                        {lead.journey.destination || <T text="Contacto" source="pt" />}
                      </strong>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${overdue ? "bg-amber-200 text-amber-950" : "bg-[var(--portal-bg-e3dcd0)]"}`}
                      >
                        <T
                          text={overdue ? "Em atraso" : (statusText[lead.status] ?? lead.status)}
                          source="pt"
                        />
                      </span>
                    </span>
                    <span className="mt-1 block text-xs opacity-80">
                      {lead.channel || "—"} · {lead.messageCount} <T text="mensagens" source="pt" />{" "}
                      ·{" "}
                      <T
                        text={lead.status === "CONTACTED" ? "contactado" : "seguimento"}
                        source="pt"
                      />{" "}
                      {when(lead.status === "CONTACTED" ? lead.contactedAt : lead.followUpAt)}
                      {lead.synthetic && " · teste"}
                    </span>
                    {lead.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {lead.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-[var(--portal-bg-143f4b)] px-1.5 py-0.5 text-[11px] text-white"
                          >
                            <T text={LEAD_TAGS[tag] ?? tag} source="pt" />
                          </span>
                        ))}
                      </span>
                    )}
                    {(lead.stage || lead.journey.destination || lead.journey.budget) && (
                      <span className="mt-1 block text-xs">
                        {lead.stage && <T text={stageText[lead.stage] ?? lead.stage} source="pt" />}
                        {[lead.journey.destination, lead.journey.timeframe, lead.journey.budget]
                          .filter(Boolean)
                          .map((value) => ` · ${value}`)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Detalhe do contacto" className="min-w-0">
          {!selected ? (
            <p className="rounded-lg border border-dashed border-[var(--portal-line-d5d1c7)] p-6 text-sm">
              <T text="Selecione um contacto para ver a conversa." source="pt" />
            </p>
          ) : (
            <article className="rounded-lg border border-[var(--portal-line-d5d1c7)] p-4">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg">
                    {selected.journey.destination || <T text="Contacto" source="pt" />}
                  </h2>
                  <p className="text-xs opacity-80">
                    <T text={statusText[selected.status] ?? selected.status} source="pt" /> ·{" "}
                    <T text="última atividade" source="pt" /> {when(selected.lastActivityAt)}
                    {selected.consentAt && (
                      <>
                        {" · "}
                        <T text="consentimento" source="pt" /> {when(selected.consentAt)}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving || selected.status === "CONTACTED"}
                  onClick={() => void markContacted()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--portal-bg-143f4b)] px-3 text-sm text-white disabled:opacity-50"
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  <T
                    text={selected.status === "CONTACTED" ? "Contactado" : "Marcar como contactado"}
                    source="pt"
                  />
                </button>
              </header>

              {Object.keys(selected.journey).length > 0 && (
                <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg bg-[var(--portal-bg-e3dcd0)] p-3 text-sm sm:grid-cols-[auto_1fr]">
                  {Object.entries(selected.journey)
                    .filter(([key]) => key !== "stage")
                    .map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="font-semibold">
                          <T text={journeyLabels[key] ?? key} source="pt" />
                        </dt>
                        <dd className="break-words">{value}</dd>
                      </div>
                    ))}
                </dl>
              )}

              {(() => {
                // Rascunho de proposta: preenche o formulário de viagem com o que o cliente
                // disse; o curador confirma os pressupostos, gera o roteiro e só depois envia.
                const today = new Date().toISOString().slice(0, 10);
                const draft = leadToBrief(selected, emptyBrief(), today);
                return (
                  <section
                    aria-label="Rascunho de proposta"
                    className="mt-3 rounded-lg border border-[var(--portal-line-d5d1c7)] p-3"
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <FileText aria-hidden="true" className="size-4" />
                      <T text="Rascunho de proposta" source="pt" />
                    </h3>
                    <p className="mt-1 text-xs opacity-80">
                      <T
                        text="Abre o formulário de viagem preenchido com o que o cliente disse. Gera locais, atividades e percursos por estrada; nada é enviado ao cliente sem revisão."
                        source="pt"
                      />
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer">
                        <T text="Pressupostos a confirmar" source="pt" /> (
                        {draft.assumptions.length})
                      </summary>
                      <ul className="mt-1 list-disc pl-5">
                        {draft.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem(LEAD_DRAFT_STORAGE, JSON.stringify(draft.brief));
                        router.push("/");
                      }}
                      className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--portal-bg-143f4b)] px-3 text-sm text-white"
                    >
                      <FileText aria-hidden="true" className="size-4" />
                      <T text="Criar rascunho de proposta" source="pt" />
                    </button>
                  </section>
                );
              })()}

              <section
                aria-label="Etiquetas do curador"
                className="mt-3 rounded-lg border border-[var(--portal-line-d5d1c7)] p-3"
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Tag aria-hidden="true" className="size-4" />
                  <T text="Etiquetas e nota do curador" source="pt" />
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(LEAD_TAGS).map(([tag, label]) => {
                    const on = draftTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraftTags((current) =>
                            on ? current.filter((value) => value !== tag) : [...current, tag],
                          )
                        }
                        className={`min-h-9 rounded-full border px-3 text-xs ${on ? "border-[var(--portal-text-143f4b)] bg-[var(--portal-bg-143f4b)] text-white" : "border-[var(--portal-line-d5d1c7)]"}`}
                      >
                        <T text={label} source="pt" />
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block text-xs" htmlFor="curator-note">
                  <T text="Nota interna (não é enviada ao cliente)" source="pt" />
                </label>
                <textarea
                  id="curator-note"
                  value={draftNote}
                  maxLength={NOTE_LIMIT}
                  onChange={(event) => setDraftNote(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--portal-line-d5d1c7)] bg-transparent p-2 text-sm"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
                  <span>
                    {selected.taggedAt && (
                      <>
                        <T text="Atualizado" source="pt" /> {when(selected.taggedAt)}
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={saving || !tagsChanged}
                    onClick={() => void saveTags()}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[var(--portal-bg-143f4b)] px-3 text-sm text-white disabled:opacity-50"
                  >
                    <Save aria-hidden="true" className="size-4" />
                    <T text="Guardar" source="pt" />
                  </button>
                </div>
              </section>

              <div className="mt-3 flex flex-wrap gap-2">
                {selected.emails.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}?subject=${encodeURIComponent("BLU Costa · A sua viagem")}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--portal-line-d5d1c7)] px-3 text-sm"
                  >
                    <Mail aria-hidden="true" className="size-4" /> {email}
                  </a>
                ))}
                {selected.phones.map((phone) => (
                  <a
                    key={phone}
                    href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--portal-line-d5d1c7)] px-3 text-sm"
                  >
                    <MessageCircle aria-hidden="true" className="size-4" /> {phone}
                  </a>
                ))}
                {!selected.emails.length && !selected.phones.length && (
                  <p className="text-sm opacity-80">
                    <T
                      text="O cliente ainda não escreveu um email ou telefone; responda pelo canal da conversa."
                      source="pt"
                    />
                  </p>
                )}
              </div>

              <ol className="mt-4 grid gap-2" aria-label="Conversa">
                {selected.messages.map((message, index) => (
                  <li
                    key={`${message.at}-${index}`}
                    className={`rounded-lg p-3 text-sm whitespace-pre-wrap break-words ${message.actor === "customer" ? "ml-8 bg-[var(--portal-bg-143f4b)] text-white" : message.actor === "system" ? "border border-dashed border-[var(--portal-line-d5d1c7)] text-xs italic" : "mr-8 bg-[var(--portal-bg-e3dcd0)]"}`}
                  >
                    <span className="mb-1 block text-[11px] opacity-75">
                      {message.actor} · {message.channel} · {when(message.at)}
                    </span>
                    {message.text}
                  </li>
                ))}
              </ol>
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
