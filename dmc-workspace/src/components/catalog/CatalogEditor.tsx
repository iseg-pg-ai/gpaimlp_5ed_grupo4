"use client";
import { SourceFields } from "../SourceFields";
import { operationalFromSource, operationalLabels } from "@/lib/catalog-operational";
import type { RefObject } from "react";
import { T } from "@/components/LocaleProvider";
import { CatalogCompatibility } from "@/components/CatalogCompatibility";
import { emptyMatching } from "@/lib/catalog-matching";
import { selectStyle } from "@/components/ui/select-style";
import {
  categories,
  subcategories,
  type Category,
  approvalFields,
  fieldGroups,
  groupProgress,
  visibleFields,
  emptyPricing,
  priceUnits,
  priceStatuses,
  categoryLabels,
  statuses,
  statusLabels,
  fieldLabels,
  type CatalogInput,
} from "@/lib/catalog-schema";
import { catalogControl as control, catalogButton as button } from "./styles";
type Props = {
  editing: CatalogInput;
  setEditing: (value: CatalogInput | null) => void;
  busy: boolean;
  save: (value: CatalogInput) => Promise<void>;
  editorRef: RefObject<HTMLFormElement | null>;
};
export function CatalogEditor({ editing, setEditing, busy, save, editorRef }: Props) {
  const referencePrices = Array.isArray(editing.sourceData?.tarifas_de_referencia)
    ? (editing.sourceData.tarifas_de_referencia as Record<string, unknown>[])
    : [];
  const fields = visibleFields(editing.category).filter((key) => key !== "kind");
  return (
    <form
      ref={editorRef}
      data-testid="catalog-editor"
      className="my-6 scroll-mt-4 rounded-2xl border border-[#9DB3B8] bg-white p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(editing);
      }}
    >
      <h2 className="text-xl font-semibold">
        <T text={editing.id ? "Editar registo" : "Novo registo"} source="pt" /> ·{" "}
        <T text={categoryLabels[editing.category]} source="pt" />
      </h2>
      <p className="my-3 text-sm leading-6">
        <T
          text="Nome e motivo são obrigatórios para guardar. As barras mostram os campos necessários para aprovação; campos opcionais não contam. Aprovar não confirma reservas."
          source="pt"
        />
      </p>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="min-w-0 text-sm">
          <T text="Categoria" source="pt" /> · <T text="Obrigatório para guardar" source="pt" />
          <select
            name="category"
            required
            disabled={Boolean(editing.id)}
            style={selectStyle}
            className={`${control} mt-1`}
            value={editing.category}
            onChange={(e) =>
              setEditing({ ...editing, category: e.target.value as Category, subcategory: "" })
            }
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                <T text={categoryLabels[category]} source="pt" />
              </option>
            ))}
          </select>
          {editing.id && (
            <span className="block mt-1">
              <T text="A categoria de um registo existente não pode ser alterada." source="pt" />
            </span>
          )}
        </label>
        <label className="min-w-0 text-sm">
          <T text="Subcategoria" source="pt" /> · <T text="Opcional" source="pt" />
          <select
            name="subcategory"
            style={selectStyle}
            className={`${control} mt-1`}
            value={editing.subcategory ?? ""}
            onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })}
          >
            <option value="">
              <T text="Sem subcategoria" source="pt" />
            </option>
            {subcategories[editing.category].map((value) => (
              <option key={value} value={value}>
                <T text={value} source="pt" />
              </option>
            ))}
          </select>
        </label>
        {editing.fields.kind && (
          <p className="md:col-span-2 text-sm">
            <T text="Classificação anterior (preservada):" source="pt" /> {editing.fields.kind}
          </p>
        )}
        {fieldGroups.map((group) => {
          const progress = groupProgress(editing, group.fields);
          return (
            <section
              key={group.title}
              className="md:col-span-2 min-w-0 rounded-xl border border-[#D5D1C7] p-4"
              data-testid="catalog-field-group"
            >
              <h3 className="font-semibold">
                <T text={group.title} source="pt" />
              </h3>
              <div className="my-3 flex items-center gap-3">
                <progress
                  className="min-w-0 w-full accent-[#143F4B]"
                  aria-label={group.title}
                  max={100}
                  value={progress.percent}
                />
                <span>{progress.percent}%</span>
              </div>
              <p className="mb-3 text-sm" aria-live="polite">
                {progress.missing.length ? (
                  <>
                    <T text="Em falta para aprovação:" source="pt" />{" "}
                    {progress.missing.map((key) => (
                      <span key={key} className="mr-2">
                        <T text={fieldLabels[key]} source="pt" />
                      </span>
                    ))}
                  </>
                ) : (
                  <T text="Campos obrigatórios preenchidos" source="pt" />
                )}
              </p>
              {group.title === "Preços" && (
                <div className="grid gap-3 sm:grid-cols-2 mb-4">
                  <label className="text-sm">
                    <T text="Estado do preço" source="pt" />
                    <select
                      name="pricing-status"
                      className={control}
                      style={selectStyle}
                      value={editing.pricing?.status ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          pricing: {
                            ...(editing.pricing ?? emptyPricing()),
                            status: e.target.value as "pending" | "confirmed" | "estimated",
                          },
                        })
                      }
                    >
                      <option value="" disabled>
                        <T text="Selecionar estado" source="pt" />
                      </option>
                      {Object.entries(priceStatuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          <T text={label} source="pt" />
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <T text="Valor (opcional se por confirmar)" source="pt" />
                    <input
                      name="pricing-amount"
                      inputMode="decimal"
                      maxLength={12}
                      className={control}
                      value={editing.pricing?.amount ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          pricing: {
                            ...(editing.pricing ?? emptyPricing()),
                            amount: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <T text="Moeda (código de três letras)" source="pt" />
                    <input
                      name="pricing-currency"
                      maxLength={3}
                      className={control}
                      value={editing.pricing?.currency ?? "EUR"}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          pricing: {
                            ...(editing.pricing ?? emptyPricing()),
                            currency: e.target.value.toUpperCase(),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <T text="Unidade de cobrança" source="pt" />
                    <select
                      name="pricing-unit"
                      className={control}
                      style={selectStyle}
                      value={editing.pricing?.unit ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          pricing: {
                            ...(editing.pricing ?? emptyPricing()),
                            unit: e.target.value as keyof typeof priceUnits,
                          },
                        })
                      }
                    >
                      <option value="">
                        <T text="Selecionar unidade" source="pt" />
                      </option>
                      {Object.entries(priceUnits).map(([value, label]) => (
                        <option key={value} value={value}>
                          <T text={label} source="pt" />
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm sm:col-span-2">
                    <T
                      text="O preço confirmado não confirma uma reserva. O texto anterior é preservado como referência."
                      source="pt"
                    />
                  </p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {group.fields
                  .filter((key) => fields.some((field) => field === key))
                  .map((key) => (
                    <label
                      key={key}
                      className={`min-w-0 text-sm ${key === "description" ? "md:col-span-2" : ""}`}
                    >
                      <T text={fieldLabels[key]} source="pt" />
                      <span className="block text-xs text-[#52646A]">
                        <T
                          text={
                            key === "name"
                              ? "Obrigatório para guardar"
                              : approvalFields.includes(key) &&
                                  !(key === "price" && editing.pricing)
                                ? "Obrigatório para aprovar"
                                : "Opcional"
                          }
                          source="pt"
                        />
                      </span>
                      {key === "effort" ? (
                        <select
                          style={selectStyle}
                          className={`${control} mt-1`}
                          name={key}
                          value={editing.fields[key]}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              fields: { ...editing.fields, [key]: e.target.value },
                            })
                          }
                        >
                          {[
                            ...new Set([
                              "",
                              "Baixo",
                              "Moderado",
                              "Alto",
                              "Por confirmar",
                              editing.fields[key],
                            ]),
                          ].map((v) => (
                            <option key={v} value={v}>
                              {v ? <T text={v} source="pt" /> : "—"}
                            </option>
                          ))}
                        </select>
                      ) : ["description", "accessibility", "dietary"].includes(key) ? (
                        <textarea
                          rows={3}
                          maxLength={4000}
                          name={key}
                          className={`${control} mt-1`}
                          value={editing.fields[key]}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              fields: { ...editing.fields, [key]: e.target.value },
                            })
                          }
                        />
                      ) : (
                        <input
                          name={key}
                          required={key === "name"}
                          maxLength={key === "name" ? 200 : 4000}
                          className={`${control} mt-1`}
                          value={editing.fields[key]}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              fields: { ...editing.fields, [key]: e.target.value },
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
              </div>
            </section>
          );
        })}
        <section className="md:col-span-2 min-w-0 rounded-xl border p-4">
          <h3 className="font-semibold">
            <T text="Dados operacionais da fonte" source="pt" />
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(Object.keys(operationalLabels) as (keyof typeof operationalLabels)[]).map((key) => (
              <label key={key} className="min-w-0 text-sm">
                <T text={operationalLabels[key]} source="pt" />
                <textarea
                  name={`operational-${key}`}
                  rows={key === "latitude" || key === "longitude" ? 1 : 3}
                  maxLength={4000}
                  className={`${control} mt-1`}
                  value={(editing.operational ?? operationalFromSource({}))[key]}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      operational: {
                        ...(editing.operational ?? operationalFromSource({})),
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>
        {referencePrices.length > 0 && (
          <label className="md:col-span-2 text-sm">
            <T text="Usar tarifa da fonte como estimativa (opcional)" source="pt" />
            <select
              name="reference-price"
              className={control}
              style={selectStyle}
              value=""
              onChange={(e) => {
                const row = referencePrices[Number(e.target.value)];
                if (!row) return;
                const units: Record<string, "person" | "group" | "hour" | "service"> = {
                  "por pessoa": "person",
                  pessoa: "person",
                  grupo: "group",
                  "por grupo": "group",
                  "por hora": "hour",
                  "por serviço": "service",
                };
                setEditing({
                  ...editing,
                  pricing: {
                    amount: String(row.preco_referencia_eur ?? ""),
                    currency: "EUR",
                    unit: units[String(row.unidade).toLowerCase()] ?? "",
                    status: "estimated",
                  },
                });
              }}
            >
              <option value="">
                <T text="Selecionar tarifa de referência" source="pt" />
              </option>
              {referencePrices.map((row, index) => (
                <option key={index} value={index}>
                  {String(row.nome_modalidade ?? row.id)} ·{" "}
                  {String(row.preco_referencia_eur ?? "Por confirmar")} EUR ·{" "}
                  {String(row.unidade ?? "")}
                </option>
              ))}
            </select>
          </label>
        )}
        {editing.sourceData && (
          <details className="md:col-span-2 min-w-0 rounded-xl border p-4">
            <summary>
              <T text="Consultar todos os dados de origem e tarifas" source="pt" />
            </summary>
            <p className="my-3 text-sm">
              <T
                text="A fonte atual é apresentada para comparação. Guardar não substitui automaticamente as edições manuais nem confirma tarifas históricas."
                source="pt"
              />
            </p>
            <SourceFields value={editing.sourceData} />
          </details>
        )}
        <div className="md:col-span-2 min-w-0">
          <p className="mb-3 text-sm">
            <T
              text="Compatibilidade: informação opcional; selecione apenas condições verificadas."
              source="pt"
            />
          </p>
          <CatalogCompatibility
            structuredPricing={Boolean(editing.pricing)}
            value={editing.matching ?? emptyMatching()}
            restaurant={editing.category === "restaurantes"}
            onChange={(matching) => setEditing({ ...editing, matching })}
          />
        </div>
        <label className="text-sm">
          <T text="Estado" source="pt" />
          <select
            style={selectStyle}
            name="status"
            className={`${control} mt-1`}
            value={editing.status}
            onChange={(e) =>
              setEditing({ ...editing, status: e.target.value as CatalogInput["status"] })
            }
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                <T text={statusLabels[s]} source="pt" />
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <T text="Motivo da alteração" source="pt" /> ·{" "}
          <T text="Obrigatório para guardar" source="pt" />
          <input
            name="reason"
            required
            maxLength={500}
            className={`${control} mt-1`}
            value={editing.reason}
            onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
          />
        </label>
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          disabled={busy}
          className={`${button} bg-[#143F4B] text-white hover:bg-[#205562]`}
          type="submit"
        >
          <T text="Guardar registo" source="pt" />
        </button>
        <button className={button} disabled={busy} type="button" onClick={() => setEditing(null)}>
          <T text="Cancelar" source="pt" />
        </button>
      </div>
    </form>
  );
}
