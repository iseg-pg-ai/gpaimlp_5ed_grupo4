"use client";
import type { RefObject } from "react";
import { T } from "@/components/LocaleProvider";
import { CatalogCompatibility } from "@/components/CatalogCompatibility";
import { emptyMatching } from "@/lib/catalog-matching";
import { selectStyle } from "@/components/ui/select-style";
import {
  categoryLabels,
  statuses,
  statusLabels,
  fieldLabels,
  type CatalogInput,
  type Fields,
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
  const fields = (Object.keys(fieldLabels) as (keyof Fields)[]).filter((key) => {
    if (["cuisine", "dietary"].includes(key)) return editing.category === "restaurantes";
    if (["provider", "modality"].includes(key)) return editing.category === "experiencias";
    if (key === "kind") return editing.category !== "restaurantes";
    return true;
  });
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
          text="Para aprovar: nome, localização, descrição, duração, preço, fonte, acessibilidade e esforço são obrigatórios. Use preços de referência com unidade; a aprovação não confirma reservas."
          source="pt"
        />
      </p>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
        {fields.map((key) => (
          <label
            key={key}
            className={`min-w-0 text-sm ${key === "description" ? "md:col-span-2" : ""}`}
          >
            <T text={fieldLabels[key]} source="pt" />
            {key === "effort" ? (
              <select
                style={selectStyle}
                className={`${control} mt-1`}
                name={key}
                value={editing.fields[key]}
                onChange={(e) =>
                  setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })
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
                  setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })
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
                  setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })
                }
              />
            )}
          </label>
        ))}
        <div className="md:col-span-2 min-w-0">
          <CatalogCompatibility
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
          <T text="Motivo da alteração" source="pt" />
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
