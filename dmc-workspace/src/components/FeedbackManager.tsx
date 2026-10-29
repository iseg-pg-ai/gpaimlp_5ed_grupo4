// Recolhe feedback de supervisão relativo às propostas apresentadas.
"use client";

import { useState } from "react";

import { portalUrl } from "@/lib/http-client";

const dimensions = [
  ["overall", "Global"],
  ["accuracy", "Exatidão"],
  ["supplier", "Fornecedor"],
  ["schedule", "Horário / duração"],
  ["value", "Qualidade / preço"],
  ["accessibility", "Acessibilidade"],
  ["dietary", "Alimentação"],
] as const;
type Dimension = (typeof dimensions)[number][0];
type Card = { dayNumber: number; itemId: string; title: string; time: string };
type Answer = {
  dayNumber: number;
  itemId: string;
  outcome: "completed" | "cancelled" | "replaced" | "not_applicable";
  ratings: Record<Dimension, number | null>;
  comment: string;
  issuesText: string;
};
type FeedbackResponse = {
  record: { status: "pending" | "submitted" } | null;
  cards: Card[];
};

const emptyRatings = () =>
  Object.fromEntries(dimensions.map(([key]) => [key, null])) as Record<Dimension, number | null>;

export function FeedbackManager({ tripId, version }: { tripId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  const request = async (body?: object) => {
    const url = portalUrl(`/api/assistant/feedback?tripId=${tripId}&version=${version}`);
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify({ tripId, version, ...body }) : undefined,
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Não foi possível registar o resultado.");
    return value;
  };

  const show = async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      let value = (await request()) as FeedbackResponse;
      if (!value.record) {
        await request({ action: "start" });
        value = (await request()) as FeedbackResponse;
      }
      setData(value);
      setAnswers(
        value.cards.map((card) => ({
          dayNumber: card.dayNumber,
          itemId: card.itemId,
          outcome: "completed",
          ratings: emptyRatings(),
          comment: "",
          issuesText: "",
        })),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível abrir o feedback.");
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, value: Partial<Answer>) =>
    setAnswers((current) =>
      current.map((answer, position) => (position === index ? { ...answer, ...value } : answer)),
    );

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await request({
        action: "submit",
        feedback: {
          notes,
          items: answers.map(({ issuesText, ...answer }) => ({
            ...answer,
            issues: issuesText
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          })),
        },
      });
      setData((current) => (current ? { ...current, record: { status: "submitted" } } : current));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar o feedback.");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await request({ action: "approve" });
      setApproved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível aprovar o caso.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="mt-3 underline cursor-pointer" onClick={show}>
        Registar resultado da viagem
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`feedback-title-${tripId}-${version}`}
        >
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-[var(--portal-white)] p-4 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--portal-text-52656b)]">
                  Feedback pós-viagem · versão {version}
                </p>
                <h2 id={`feedback-title-${tripId}-${version}`} className="mt-1 text-2xl">
                  Resultado real do itinerário
                </h2>
              </div>
              <button
                type="button"
                className="rounded border px-3 py-2"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
            {busy && !data && <p>A carregar…</p>}
            {data?.record?.status === "submitted" ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
                <p className="font-semibold">Feedback entregue e imutável.</p>
                <p className="mt-2 text-sm">
                  A aprovação cria apenas um caso anonimizado. Comentários e notas não são enviados
                  ao agente.
                </p>
                <button
                  type="button"
                  disabled={busy || approved}
                  className="mt-4 rounded-lg bg-[var(--portal-text-143f4b)] px-4 py-2 text-white disabled:opacity-50"
                  onClick={approve}
                >
                  {approved ? "Caso aprovado" : "Aprovar como caso histórico"}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {data?.cards.map((card, index) => {
                  const answer = answers[index];
                  if (!answer) return null;
                  const completed = answer.outcome === "completed";
                  return (
                    <article
                      key={`${card.dayNumber}:${card.itemId}`}
                      className="rounded-xl border p-4"
                    >
                      <p className="text-xs uppercase tracking-wider text-[var(--portal-text-52656b)]">
                        Dia {card.dayNumber} · {card.time}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">{card.title}</h3>
                      <label className="mt-3 block text-sm font-medium">
                        Resultado
                        <select
                          className="mt-1 block w-full rounded-lg border bg-white p-2 sm:w-auto"
                          value={answer.outcome}
                          onChange={(event) => {
                            const outcome = event.target.value as Answer["outcome"];
                            update(index, {
                              outcome,
                              ratings: outcome === "completed" ? answer.ratings : emptyRatings(),
                            });
                          }}
                        >
                          <option value="completed">Realizada</option>
                          <option value="cancelled">Cancelada</option>
                          <option value="replaced">Substituída</option>
                          <option value="not_applicable">Não aplicável</option>
                        </select>
                      </label>
                      {completed && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {dimensions.map(([key, label]) => (
                            <label key={key} className="text-sm">
                              {label}
                              {key === "overall" ? " *" : ""}
                              <select
                                className="mt-1 block w-full rounded-lg border bg-white p-2"
                                value={answer.ratings[key] ?? ""}
                                onChange={(event) =>
                                  update(index, {
                                    ratings: {
                                      ...answer.ratings,
                                      [key]: event.target.value ? Number(event.target.value) : null,
                                    },
                                  })
                                }
                              >
                                <option value="">N/A</option>
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <option key={score} value={score}>
                                    {score}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                          Etiquetas de problema, separadas por vírgulas
                          <input
                            className="mt-1 block w-full rounded-lg border p-2"
                            value={answer.issuesText}
                            onChange={(event) => update(index, { issuesText: event.target.value })}
                          />
                        </label>
                        <label className="text-sm">
                          Comentário interno
                          <input
                            className="mt-1 block w-full rounded-lg border p-2"
                            maxLength={2000}
                            value={answer.comment}
                            onChange={(event) => update(index, { comment: event.target.value })}
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
                {data && !data.cards.length && <p>Esta versão não contém cartões para avaliar.</p>}
                <label className="block text-sm">
                  Notas internas da viagem
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border p-3"
                    maxLength={4000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !data?.cards.length}
                  className="rounded-lg bg-[var(--portal-text-143f4b)] px-5 py-3 text-white disabled:opacity-50"
                  onClick={submit}
                >
                  Entregar feedback
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
