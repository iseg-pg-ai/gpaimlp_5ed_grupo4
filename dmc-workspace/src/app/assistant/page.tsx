"use client";

import { useState } from "react";
import { portalFetch, portalUrl, responseJson } from "@/lib/http-client";
import type { OperationsData } from "@/lib/assistant-operations";
import type { ItemFeedback } from "@/lib/feedback-store";
import { languages } from "@/lib/locales";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import type { AgentProposal } from "@/lib/assistant-actions";
import type { ChatMessage } from "@/types";

const ratings = [
  ["overall", "Global"],
  ["accuracy", "Exatidão"],
  ["supplier", "Fornecedor"],
  ["schedule", "Horário e duração"],
  ["value", "Qualidade/preço"],
  ["accessibility", "Acessibilidade"],
  ["dietary", "Alimentação"],
] as const;
const control = "w-full rounded border border-[#D5D1C7] bg-white p-2 text-sm";
const button = "min-h-11 rounded border border-[#143F4B] px-3 py-2 text-sm disabled:opacity-50";

export default function AssistantOperationsPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("");
  const [tab, setTab] = useState("diagnostics");
  const [locale, setLocale] = useState("pt");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState("");
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState<Record<string, ItemFeedback>>({});
  const [notes, setNotes] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const load = async (weather = false, overrideSelection?: string) => {
    setBusy(true);
    setError("");
    try {
      const [tripId, version] = (overrideSelection ?? selection).split(":");
      const params = new URLSearchParams({
        locale,
        query,
        ...(tripId ? { tripId, version } : {}),
        ...(compare ? { compareVersion: compare } : {}),
        ...(weather ? { weather: "1" } : {}),
      });
      const next = await responseJson<OperationsData>(
        await portalFetch(`/api/assistant/operations?${params}`, {
          headers: headers(),
          cache: "no-store",
        }),
      );
      setData(next);
      if (next.selected) setSelection(`${next.selected.tripId}:${next.selected.version}`);
      setAnswers({});
      setDraft("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await responseJson<{ draft?: string }>(
        await portalFetch("/api/assistant/operations", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ action, ...data?.selected, confirm: true, ...extra }),
        }),
      );
      if (result.draft) setDraft(result.draft);
      else {
        await load();
        setNotice("Operação registada.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "A operação falhou.");
    } finally {
      setBusy(false);
    }
  };
  const selectedFeedback = data?.feedback.find(
    (row) => row.tripId === data.selected?.tripId && row.version === data.selected?.version,
  );
  const append = (sender: ChatMessage["sender"], text: string) =>
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender, text, timestamp: new Date().toLocaleTimeString("pt-PT") },
    ]);
  const ask = async (input: string) => {
    if (busy || !data?.selected || !data.snapshot) return;
    append("user", input);
    setBusy(true);
    setError("");
    try {
      if (/^(ok|sim|aceito|confirmo)[.!?]*$/i.test(input.trim())) {
        append(
          "assistant",
          "Reveja a proposta e use o botão de aceitação. Esta mensagem não executa alterações.",
        );
        return;
      }
      const result = await responseJson<AgentProposal>(
        await portalFetch("/api/assistant/plan", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            tripId: data.selected.tripId,
            baseVersion: data.selected.version,
            snapshot: data.snapshot,
            input,
            currentView:
              tab === "quality" ? "catalog" : tab === "diagnostics" ? "export" : "itinerary",
            conversation: messages
              .slice(-8)
              .map(({ sender, text }) => ({ sender, text: text.slice(0, 4000) })),
            pendingRunId: proposal?.runId,
          }),
        }),
      );
      setProposal(
        result.plan.actions.length || result.alternatives?.length || result.rankedCandidates?.length
          ? result
          : null,
      );
      append("assistant", result.plan.summary);
    } catch (error) {
      append("assistant", error instanceof Error ? error.message : "Falha no planeador.");
    } finally {
      setBusy(false);
    }
  };
  const decide = async (decision: "accept" | "reject", rejectionReason = "") => {
    if (busy || !proposal) return;
    setBusy(true);
    setError("");
    try {
      const result = await responseJson<{ version?: number }>(
        await portalFetch("/api/assistant/plan", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            tripId: proposal.tripId,
            baseVersion: proposal.baseVersion,
            runId: proposal.runId,
            decision,
            rejectionReason,
          }),
        }),
      );
      setProposal(null);
      append(
        "assistant",
        decision === "accept" ? "Proposta aceite e guardada." : "Proposta rejeitada.",
      );
      if (result.version) {
        const next = `${proposal.tripId}:${result.version}`;
        setSelection(next);
        await load(false, next);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "A decisão falhou.");
    } finally {
      setBusy(false);
    }
  };
  const select = async (dayNumber: number, itemId: string, catalogId: string) => {
    if (busy || !proposal) return;
    setBusy(true);
    setError("");
    try {
      const result = await responseJson<AgentProposal>(
        await portalFetch("/api/assistant/plan", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            tripId: proposal.tripId,
            baseVersion: proposal.baseVersion,
            runId: proposal.runId,
            decision: itemId ? "select" : "select-add",
            dayNumber,
            itemId,
            catalogId,
          }),
        }),
      );
      setProposal(result);
      append("assistant", result.plan.summary);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível preparar a escolha.");
    } finally {
      setBusy(false);
    }
  };
  const key = (dayNumber: number, itemId: string) => `${dayNumber}:${itemId}`;
  const initial = (dayNumber: number, itemId: string): ItemFeedback => ({
    dayNumber,
    itemId,
    outcome: "not_applicable",
    ratings: Object.fromEntries(ratings.map(([field]) => [field, null])) as ItemFeedback["ratings"],
    issues: [],
    comment: "",
  });
  const update = (dayNumber: number, itemId: string, patch: Partial<ItemFeedback>) =>
    setAnswers((current) => ({
      ...current,
      [key(dayNumber, itemId)]: {
        ...(current[key(dayNumber, itemId)] ?? initial(dayNumber, itemId)),
        ...patch,
      },
    }));
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 text-[#143F4B]">
      <h1 className="font-serif text-2xl">Operações do assistente BLU</h1>
      <p>
        Feedback, casos revistos, alertas e controlo de qualidade. Ações operacionais exigem acesso
        autenticado e revisão humana.
      </p>
      <a className="underline" href={portalUrl("/")}>
        Voltar ao roteiro
      </a>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="min-w-48 flex-1">
          Token operacional
          <input
            className={control}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <button className={button} disabled={busy}>
          {busy ? "A carregar…" : "Entrar / atualizar"}
        </button>
        <button
          className={button}
          type="button"
          onClick={() => {
            setToken("");
            setData(null);
            setAnswers({});
            setDraft("");
            setMessages([]);
            setProposal(null);
          }}
        >
          Terminar sessão
        </button>
      </form>
      <p className="text-sm">
        O token fica apenas na memória desta página. A identidade usada na auditoria é definida no
        servidor.
      </p>
      {error && (
        <p role="alert" className="rounded border border-red-500 p-3">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              Versão para trabalhar
              <select
                className={control}
                value={selection}
                onChange={(event) => {
                  setSelection(event.target.value);
                  setAnswers({});
                  setMessages([]);
                  setProposal(null);
                }}
              >
                {data.versions.map((version) => (
                  <option
                    key={`${version.tripId}:${version.version}`}
                    value={`${version.tripId}:${version.version}`}
                  >
                    {version.tripId} · v{version.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Idioma da entrega
              <select
                className={control}
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={button} disabled={busy} onClick={() => void load()}>
              Abrir seleção
            </button>
          </div>
          <nav aria-label="Operações BLU" className="flex flex-wrap gap-2">
            {[
              ["diagnostics", "Alertas e entrega"],
              ["feedback", "Feedback pós-viagem"],
              ["quality", "Qualidade do catálogo"],
              ["cases", "Casos históricos"],
              ["metrics", "Desempenho"],
            ].map(([id, label]) => (
              <button
                className={button}
                aria-pressed={tab === id}
                key={id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {data.snapshot && data.selected && (
            <p className="rounded bg-stone-100 p-3">
              {data.snapshot.brief.destination} · {data.snapshot.brief.startDate} —{" "}
              {data.snapshot.brief.endDate} · versão {data.selected.version}
            </p>
          )}
          {tab === "diagnostics" && (
            <section className="space-y-3">
              <h2 className="text-xl">Verificação antes de exportar</h2>
              <p>
                {data.diagnostics.filter((alert) => alert.severity === "blocker").length} bloqueios
                · {data.diagnostics.filter((alert) => alert.severity === "warning").length} avisos.
                A revisão de idiomas, conteúdo e apresentação continua humana.
              </p>
              <ul className="space-y-2">
                {data.diagnostics.map((alert, index) => (
                  <li key={index} className="rounded border p-2">
                    <strong>
                      {alert.severity === "blocker" ? "Bloqueio" : "Aviso"} · {alert.code}
                    </strong>{" "}
                    · {alert.message}
                    <p className="text-xs">Fonte: {alert.source}</p>
                  </li>
                ))}
              </ul>
              <button className={button} disabled={busy} onClick={() => void load(true)}>
                Consultar meteorologia dos primeiros três dias
              </button>
              <p>
                A consulta envia datas, localidades e coordenadas disponíveis à Open-Meteo. O
                assistente só usa resultados já consultados e ainda em cache.
              </p>
              {Object.entries(data.weather).map(([day, result]) => (
                <p key={day}>
                  Dia {day}:{" "}
                  {result.status === "available"
                    ? `${result.weather.conditionPt} · ${result.weather.isHistorical ? "Referência histórica, não previsão" : "Previsão Open-Meteo"}`
                    : "Meteorologia indisponível"}
                </p>
              ))}
              {data.budget && (
                <div>
                  {Object.entries(data.budget.totals).map(([currency, total]) => (
                    <p key={currency}>
                      {currency} · confirmado {(total.confirmed / 100).toFixed(2)} · estimado{" "}
                      {(total.estimated / 100).toFixed(2)}
                    </p>
                  ))}
                  <p>
                    {data.budget.incomplete
                      ? "Total incompleto: custos desconhecidos não são gratuitos."
                      : "Subtotais conhecidos; disponibilidade continua por rever."}
                  </p>
                </div>
              )}
              <label>
                Comparar com versão anterior
                <select
                  className={control}
                  value={compare}
                  onChange={(event) => setCompare(event.target.value)}
                >
                  <option value="">Sem comparação</option>
                  {data.versions
                    .filter((version) => version.tripId === data.selected?.tripId)
                    .map((version) => (
                      <option key={version.version} value={version.version}>
                        v{version.version}
                      </option>
                    ))}
                </select>
              </label>
              <button className={button} disabled={busy} onClick={() => void load()}>
                Calcular comparação
              </button>
              {data.comparison && (
                <ul>
                  {data.comparison.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              )}
              <h3 className="text-lg">Comunicação para revisão</h3>
              <p>
                Preparar um texto no idioma escolhido, sem contactos, notas internas ou envio
                automático.
              </p>
              <button
                className={button}
                disabled={busy || !data.snapshot}
                onClick={() => void mutate("communication", { locale })}
              >
                Preparar rascunho de email
              </button>
              <button
                className={button}
                disabled={busy || !data.snapshot}
                onClick={() => void mutate("communication", { locale, kind: "supplier" })}
              >
                Preparar pedido de informação aos fornecedores
              </button>
              {draft && (
                <label>
                  Rascunho editável — rever antes de enviar
                  <textarea
                    className={`${control} min-h-64`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </label>
              )}
              {data.snapshot?.itinerary.flatMap((day) =>
                day.items
                  .filter(
                    (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
                  )
                  .map((item) => (
                    <a
                      key={`${day.dayNumber}:${item.id}`}
                      className="mr-3 underline"
                      href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=16/${item.latitude}/${item.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mapa · {item.title}
                    </a>
                  )),
              )}
            </section>
          )}
          {tab === "feedback" && (
            <section className="space-y-4">
              <h2 className="text-xl">Versão efetivamente realizada</h2>
              <p>
                Seleciona a versão realizada antes de registar a conclusão. Cada cartão exige
                resposta, incluindo «Não aplicável». O feedback entregue fica imutável.
              </p>
              {!selectedFeedback && (
                <button
                  className={button}
                  disabled={busy || !data.selected}
                  onClick={() => {
                    if (window.confirm("Confirmar que esta é a versão efetivamente realizada?"))
                      void mutate("complete");
                  }}
                >
                  Marcar viagem concluída — feedback pendente
                </button>
              )}
              {selectedFeedback?.status === "pending" && (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (window.confirm("Guardar definitivamente o feedback de todos os cartões?"))
                      void mutate("feedback", {
                        feedback: {
                          notes,
                          items: data.snapshot!.itinerary.flatMap((day) =>
                            day.items.map((item) => answers[key(day.dayNumber, item.id)]),
                          ),
                        },
                      });
                  }}
                >
                  {data.snapshot?.itinerary.flatMap((day) =>
                    day.items.map((item) => {
                      const answer = answers[key(day.dayNumber, item.id)];
                      return (
                        <fieldset
                          key={key(day.dayNumber, item.id)}
                          className="space-y-2 rounded border p-3"
                        >
                          <legend>
                            Dia {day.dayNumber} · {item.title} · revisão{" "}
                            {item.catalogRevision ?? "desconhecida"}
                          </legend>
                          <label>
                            Resultado
                            <select
                              className={control}
                              required
                              value={answer?.outcome ?? ""}
                              onChange={(event) =>
                                update(day.dayNumber, item.id, {
                                  outcome: event.target.value as ItemFeedback["outcome"],
                                  ratings: initial(day.dayNumber, item.id).ratings,
                                })
                              }
                            >
                              <option value="" disabled>
                                Escolher resposta
                              </option>
                              <option value="completed">Realizada</option>
                              <option value="cancelled">Cancelada</option>
                              <option value="replaced">Substituída</option>
                              <option value="not_applicable">Não aplicável</option>
                            </select>
                          </label>
                          {answer?.outcome === "completed" && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {ratings.map(([field, label]) => (
                                <label key={field}>
                                  {label}
                                  <select
                                    className={control}
                                    required={field === "overall"}
                                    value={answer.ratings[field] ?? ""}
                                    onChange={(event) =>
                                      update(day.dayNumber, item.id, {
                                        ratings: {
                                          ...answer.ratings,
                                          [field]: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        },
                                      })
                                    }
                                  >
                                    <option value="">
                                      {field === "overall" ? "Escolher avaliação" : "Não aplicável"}
                                    </option>
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <option key={n} value={n}>
                                        {n}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                          )}
                          <label>
                            Problemas (separados por vírgula)
                            <input
                              className={control}
                              maxLength={500}
                              value={answer?.issues.join(", ") ?? ""}
                              onChange={(event) =>
                                update(day.dayNumber, item.id, {
                                  issues: event.target.value
                                    .split(",")
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </label>
                          <label>
                            Comentário
                            <textarea
                              className={control}
                              maxLength={2000}
                              value={answer?.comment ?? ""}
                              onChange={(event) =>
                                update(day.dayNumber, item.id, { comment: event.target.value })
                              }
                            />
                          </label>
                        </fieldset>
                      );
                    }),
                  )}
                  <label>
                    Notas globais
                    <textarea
                      className={control}
                      maxLength={4000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                  <button className={button} disabled={busy}>
                    Rever e guardar feedback
                  </button>
                </form>
              )}
              {selectedFeedback?.status === "submitted" && (
                <>
                  <p>
                    Feedback entregue por {selectedFeedback.operator} em{" "}
                    {selectedFeedback.feedbackAt}.
                  </p>
                  {data.responses.map((row, index) => (
                    <p key={index}>
                      Dia {String(row.dayNumber)} · {String(row.itemId)} · {String(row.outcome)} ·
                      global {row.ratings.overall ?? "N/A"} · {String(row.comment)}
                    </p>
                  ))}
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Aprovar este caso para reutilização anónima em recomendações?",
                        )
                      )
                        void mutate("approve-case");
                    }}
                  >
                    Rever e aprovar como caso histórico
                  </button>
                </>
              )}
              <h3>Histórico de conclusões</h3>
              {data.feedback.map((row) => (
                <p key={`${row.tripId}:${row.version}`}>
                  {row.tripId} · v{row.version} ·{" "}
                  {row.status === "pending" ? "Feedback pendente" : "Feedback entregue"}
                </p>
              ))}
            </section>
          )}
          {tab === "quality" && (
            <section className="space-y-4">
              <h2 className="text-xl">Qualidade e tendências</h2>
              <p>
                Os alertas propõem revisão; não alteram automaticamente o catálogo. Inativar impede
                novas recomendações sem apagar feedback ou versões.
              </p>
              {data.quality.map((row) => (
                <article key={row.catalogId} className="rounded border p-3">
                  <h3>
                    {row.catalogId} · {row.alert ? "Rever" : "Sem alerta de feedback"}
                  </h3>
                  <p>
                    {row.uses} utilizações · {row.ratings} avaliações · média{" "}
                    {row.average?.toFixed(2) ?? "Sem avaliações"} · {row.cancelled} canceladas ·{" "}
                    {row.replaced} substituídas
                  </p>
                  <p>{row.issues.join(" · ")}</p>
                  {row.windows.map((window) => (
                    <p key={window.days}>
                      {window.days} dias: {window.uses} utilizações · média{" "}
                      {window.average?.toFixed(2) ?? "Desconhecida"}
                    </p>
                  ))}
                </article>
              ))}
              {data.records.map((record) => (
                <form
                  key={record.id}
                  className="space-y-2 rounded border p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    if (window.confirm(`Confirmar a decisão sobre ${record.name}?`))
                      void mutate("catalog-decision", {
                        catalogId: record.id,
                        baseRevision: record.revision,
                        decision: form.get("decision"),
                        reason: form.get("reason"),
                      });
                  }}
                >
                  <h3>
                    {record.name} · {record.status} · revisão {record.revision}
                  </h3>
                  <p>{record.issues.join(" · ") || "Sem anomalias estruturais detetadas."}</p>
                  <label>
                    Decisão
                    <select className={control} name="decision">
                      <option value="keep">Manter estado atual</option>
                      <option value="review">Colocar em revisão</option>
                      <option value="inactive">Inativar</option>
                    </select>
                  </label>
                  <label>
                    Motivo
                    <input className={control} name="reason" required maxLength={500} />
                  </label>
                  <button className={button} disabled={busy}>
                    Rever e aplicar decisão
                  </button>
                </form>
              ))}
              <a className="underline" href={portalUrl("/catalog")}>
                Editar conteúdo no catálogo existente
              </a>
            </section>
          )}
          {tab === "cases" && (
            <section className="space-y-3">
              <h2 className="text-xl">Casos revistos semelhantes</h2>
              <label>
                Pesquisa textual
                <input
                  className={control}
                  value={query}
                  maxLength={200}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button className={button} disabled={busy} onClick={() => void load()}>
                Pesquisar
              </button>
              <p>
                Apenas versões com feedback completo e aprovação humana, média mínima 4 e sem
                incidentes. Não se copiam contactos, notas ou nomes de clientes.
              </p>
              {data.cases.map((row) => (
                <article key={row.caseId} className="rounded border p-3">
                  <h3>
                    Caso {row.caseId} · relevância {row.score}
                  </h3>
                  <p>{row.reasons.join(" · ")}</p>
                  <p>
                    {row.items.map((item: { catalogId: string }) => item.catalogId).join(" · ")}
                  </p>
                </article>
              ))}
            </section>
          )}
          {tab === "metrics" && (
            <section className="space-y-3">
              <h2 className="text-xl">Desempenho do assistente</h2>
              <p>
                {data.metrics.total} execuções · {data.metrics.accepted} aceites ·{" "}
                {data.metrics.rejected} rejeitadas · {data.metrics.expired} expiradas
              </p>
              <p>
                Taxa de aceitação entre decisões:{" "}
                {data.metrics.accepted + data.metrics.rejected
                  ? `${((100 * data.metrics.accepted) / (data.metrics.accepted + data.metrics.rejected)).toFixed(1)}%`
                  : "Sem decisões"}
              </p>
              <p>
                {String(data.metrics.corrections)} versões editadas fora de decisões do agente
                (inclui edições manuais; não mede causalidade).
              </p>
              {data.metrics.models.map((model) => (
                <article className="rounded border p-3" key={model.modelId}>
                  <h3>{model.modelId}</h3>
                  <p>
                    {model.runs} execuções · {model.inputTokens} tokens de entrada ·{" "}
                    {model.outputTokens} de saída · latência média{" "}
                    {model.averageLatencyMs.toFixed(0)} ms
                  </p>
                  <p>
                    {model.costUsd === null
                      ? "Custo monetário não configurado"
                      : `Estimativa configurada: ${model.costUsd.toFixed(6)} USD`}
                  </p>
                </article>
              ))}
              <h3>Últimas decisões</h3>
              {data.metrics.decisions.map((decision, index) => (
                <p key={index}>
                  {String(decision.createdAt)} · {String(decision.status)} ·{" "}
                  {decision.reason || "Sem motivo indicado"}
                </p>
              ))}
              <p>
                Prompts, modelos e rankings não são alterados automaticamente com base nestas
                métricas.
              </p>
            </section>
          )}
          {data.selected && (
            <section className="max-w-2xl">
              <h2 className="text-xl">
                Assistente contextual —{" "}
                {tab === "diagnostics"
                  ? "revisão da entrega"
                  : tab === "quality"
                    ? "catálogo"
                    : "roteiro"}
              </h2>
              <p>
                O assistente propõe alterações ao roteiro; decisões de catálogo usam os formulários
                de revisão acima.
              </p>
              <AIAssistantPanel
                messages={messages}
                onSendMessage={(text) => void ask(text)}
                isProcessing={busy}
                proposal={proposal}
                onDecideProposal={(decision, reason) => void decide(decision, reason)}
                onSelectAlternative={(day, item, id) => void select(day, item, id)}
                onDismissProposal={() => setProposal(null)}
                onResetItinerary={() => {
                  setMessages([]);
                  setProposal(null);
                }}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}
