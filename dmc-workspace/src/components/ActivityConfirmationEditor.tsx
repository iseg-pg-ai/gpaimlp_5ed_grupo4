"use client";
import { useEffect, useRef, useState } from "react";
import type { ActivityItem } from "@/types";
import {
  initialConfirmation,
  validateConfirmation,
  confirmationFields,
  mergeConfirmationDefaults,
  hasKnownPrice,
  type ActivityConfirmation,
} from "@/lib/activity-confirmation";
import { T } from "./LocaleProvider";
export function ActivityConfirmationEditor({
  activity,
  onSave,
  disabled,
}: {
  activity: ActivityItem;
  onSave: (value: ActivityConfirmation) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(() => initialConfirmation(activity));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState(activity.catalogDetails);
  const dirty = useRef(false);
  const touched = useRef(new Set<keyof ActivityConfirmation>());
  const editingId = useRef(activity.id);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    if (editingId.current !== activity.id) {
      editingId.current = activity.id;
      dirty.current = false;
      touched.current.clear();
    }
    queueMicrotask(() => {
      if (active && !dirty.current) {
        setValue(initialConfirmation(activity));
        setCatalog(activity.catalogDetails);
      }
    });
    if (!activity.catalogDetails && !activity.confirmation) {
      fetch(`/api/catalog/itinerary?id=${encodeURIComponent(activity.id)}`)
        .then(async (response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (active && data) {
            setCatalog(data);
            setValue((current) =>
              mergeConfirmationDefaults(
                current,
                initialConfirmation({ ...activity, catalogDetails: data }),
                touched.current,
              ),
            );
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [activity]);
  const change = (patch: Partial<ActivityConfirmation>) => {
    dirty.current = true;
    for (const key of Object.keys(patch) as (keyof ActivityConfirmation)[])
      touched.current.add(key);
    setValue((v) => ({ ...v, ...patch, status: "pending", confirmedAt: null }));
    setNotice("");
  };
  async function save(confirm: boolean) {
    if (saving.current || disabled || activity.isLocked) return;
    saving.current = true;
    const next: ActivityConfirmation = {
      ...value,
      ...(catalog ? { catalogDetails: catalog } : {}),
      status: confirm ? "confirmed" : "pending",
      confirmedAt: confirm ? new Date().toISOString() : null,
    };
    setError("");
    setNotice("");
    try {
      validateConfirmation(activity, next);
      setBusy(true);
      if (await onSave(next)) {
        dirty.current = false;
        touched.current.clear();
        setValue(next);
        setNotice("Alterações guardadas na versão do roteiro.");
      } else
        setError(
          "Não foi possível guardar. Os dados preenchidos foram mantidos; consulte o erro no topo do roteiro.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      data-testid="activity-confirmations"
      className="mt-4 rounded-xl border border-[#C5D4D8] bg-[#F5F8F8] p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        <T text="Dados e confirmações" source="pt" /> ·{" "}
        {value.checks.filter((c) => c.resolved).length}/{value.checks.length}
      </summary>
      <p className="my-3 text-sm leading-6">
        <T
          text="Os dados disponíveis no catálogo são preenchidos automaticamente. Complete apenas o que falta ou ajuste o que mudou para esta viagem. Confirmar não efetua reservas junto do fornecedor."
          source="pt"
        />
      </p>
      {(!value.time || !value.location.trim() || !hasKnownPrice(value.price)) && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <T text="Por confirmar" source="pt" />:
          <ul className="mt-1 list-inside list-disc">
            {(["time", "location", "price"] as const)
              .filter((key) => (key === "price" ? !hasKnownPrice(value.price) : !value[key].trim()))
              .map((key) => (
                <li key={key}>
                  <T text={confirmationFields[key]} source="pt" />
                </li>
              ))}
          </ul>
        </div>
      )}
      {catalog && (
        <div className="mb-4 space-y-2 rounded-lg border bg-white p-3 text-sm">
          <p className="font-semibold">
            <T text="Informação do catálogo" source="pt" />
          </p>
          {catalog.hours && (
            <p>
              <T text="Horário de funcionamento (não é a hora da visita)" source="pt" />:{" "}
              {catalog.hours}
            </p>
          )}
          {catalog.accessibility && (
            <p>
              <T text="Acessibilidade" source="pt" />: {catalog.accessibility}
            </p>
          )}
          {catalog.dietary && (
            <p>
              <T text="Condições alimentares" source="pt" />: {catalog.dietary}
            </p>
          )}
          {catalog.verification && (
            <p>
              <T text="Verificação registada" source="pt" />: {catalog.verification}
            </p>
          )}
          <p>
            <T
              text="O preço do catálogo é uma referência; valide as condições aplicáveis à viagem. Fornecedor, contacto e referência de reserva são opcionais quando não se aplicam."
              source="pt"
            />
          </p>
        </div>
      )}
      {activity.isLocked && (
        <p className="mb-3 text-sm">
          <T text="Desproteja a atividade antes de editar as confirmações." source="pt" />
        </p>
      )}
      {error && (
        <p role="alert" className="my-3 text-sm text-red-800">
          <T text={error} source="pt" />
        </p>
      )}
      {notice && (
        <p role="status" className="my-3 text-sm text-[#245C49]">
          <T text={notice} source="pt" />
        </p>
      )}
      <fieldset disabled={disabled || busy || activity.isLocked} className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(confirmationFields) as (keyof typeof confirmationFields)[]).map((key) => (
            <label
              key={key}
              className={`min-w-0 text-sm ${key === "notes" ? "sm:col-span-2" : ""}`}
            >
              <T text={confirmationFields[key]} source="pt" />
              {key === "notes" ? (
                <textarea
                  name={`confirmation-${key}`}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border bg-white p-3"
                  value={value[key]}
                  onChange={(e) => change({ [key]: e.target.value })}
                />
              ) : (
                <input
                  name={`confirmation-${key}`}
                  type={key === "time" ? "time" : "text"}
                  maxLength={4000}
                  className="mt-1 w-full min-w-0 rounded-lg border bg-white p-3"
                  value={value[key]}
                  onChange={(e) => change({ [key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        {value.checks.map((check, index) => (
          <div key={check.label} className="rounded-lg border bg-white p-3">
            <label className="block text-sm">
              <T text={check.label} source="pt" />
              <textarea
                aria-label={check.label}
                maxLength={4000}
                value={check.details}
                className="mt-2 w-full rounded border p-2"
                onChange={(e) =>
                  change({
                    checks: value.checks.map((c, i) =>
                      i === index ? { ...c, details: e.target.value, resolved: false } : c,
                    ),
                  })
                }
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={check.resolved}
                onChange={(e) =>
                  change({
                    checks: value.checks.map((c, i) =>
                      i === index ? { ...c, resolved: e.target.checked } : c,
                    ),
                  })
                }
              />
              <T text="Pendência resolvida" source="pt" />
            </label>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-lg border bg-white px-4 py-2 text-sm"
            onClick={() => save(false)}
          >
            <T
              text={
                activity.confirmation?.status === "confirmed"
                  ? "Guardar e voltar a pendente"
                  : "Guardar progresso"
              }
              source="pt"
            />
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-[#2D5B67] px-4 py-2 text-sm text-white"
            onClick={() => save(true)}
          >
            <T text="Confirmar atividade" source="pt" />
          </button>
        </div>
      </fieldset>
    </details>
  );
}
