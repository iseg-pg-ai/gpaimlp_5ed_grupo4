"use client";
import { T } from "./LocaleProvider";
import { subcategories, categoryLabels, type Category } from "@/lib/catalog-schema";
import {
  emptyPersonalization,
  accompanimentLabels,
  type Personalization,
} from "@/lib/brief-personalization";
import { selectStyle } from "./ui/select-style";
const control = "mt-1 w-full min-w-0 rounded-lg border border-[#9DB3B8] bg-white p-3 text-base";
export function BriefPersonalization({
  value,
  onChange,
}: {
  value?: Personalization;
  onChange: (v: Personalization) => void;
}) {
  const p = value ?? emptyPersonalization();
  const update = (patch: Partial<Personalization>) => onChange({ ...p, ...patch });
  return (
    <section
      className="space-y-5 rounded-xl border bg-white p-5"
      data-testid="brief-personalization"
    >
      <h2 className="text-lg font-semibold">
        <T text="Personalizar a proposta" source="pt" />
      </h2>
      {(["mustHave", "avoid"] as const).map((key) => (
        <details key={key} className="rounded-lg border p-3">
          <summary className="cursor-pointer">
            <T
              text={key === "mustHave" ? "Experiências imperdíveis" : "Atividades a evitar"}
              source="pt"
            />{" "}
            ({p[key].length})
          </summary>
          {Object.entries(subcategories).map(([category, options]) => (
            <fieldset key={category} className="mt-3">
              <legend className="font-semibold">
                <T text={categoryLabels[category as Category]} source="pt" />
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <label key={option} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={key}
                      value={option}
                      checked={p[key].includes(option)}
                      onChange={(e) =>
                        update({
                          [key]: e.target.checked
                            ? [...p[key], option]
                            : p[key].filter((v) => v !== option),
                          [key === "mustHave" ? "avoid" : "mustHave"]: p[
                            key === "mustHave" ? "avoid" : "mustHave"
                          ].filter((v) => v !== option),
                        })
                      }
                    />
                    <T text={option} source="pt" />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </details>
      ))}
      <p className="text-sm">
        <T
          text="Imperdíveis têm prioridade entre ofertas elegíveis. Exclusões prevalecem; pedidos sem correspondência ficam por confirmar."
          source="pt"
        />
      </p>
      <label className="block">
        <T text="Flexibilidade do orçamento" source="pt" />
        <select
          name="budgetFlex"
          className={control}
          style={selectStyle}
          value={p.budgetFlex}
          onChange={(e) => update({ budgetFlex: Number(e.target.value) })}
        >
          <option value={0}>
            <T text="Sem margem adicional" source="pt" />
          </option>
          <option value={10}>+10%</option>
          <option value={20}>+20%</option>
        </select>
      </label>
      {p.budgetFlex > 0 && (
        <p className="text-sm">
          <T
            text="A margem aumenta apenas o limite autorizado; não garante o preço final da viagem."
            source="pt"
          />
        </p>
      )}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          name="extraBreaks"
          checked={p.extraBreaks}
          onChange={(e) => update({ extraBreaks: e.target.checked })}
        />
        <T text="O grupo necessita de pausas adicionais" source="pt" />
      </label>
      {
        <label className="block">
          <T text="Necessidades adicionais do grupo (revisão pelo curador)" source="pt" />
          <textarea
            name="groupNeeds"
            maxLength={4000}
            className={control}
            value={p.groupNeeds}
            onChange={(e) => update({ groupNeeds: e.target.value })}
          />
        </label>
      }
      <label className="block">
        <T text="Preferência de acompanhamento" source="pt" />
        <select
          name="accompaniment"
          style={selectStyle}
          className={control}
          value={p.accompaniment}
          onChange={(e) =>
            update({
              accompaniment: e.target.value as Personalization["accompaniment"],
              guideLanguage: "",
            })
          }
        >
          {Object.entries(accompanimentLabels).map(([key, label]) => (
            <option key={key} value={key}>
              <T text={label} source="pt" />
            </option>
          ))}
        </select>
      </label>
      {["guided", "private"].includes(p.accompaniment) && (
        <label className="block">
          <T text="Idioma do acompanhamento (sujeito a confirmação)" source="pt" />
          <select
            name="guideLanguage"
            style={selectStyle}
            className={control}
            value={p.guideLanguage}
            onChange={(e) => update({ guideLanguage: e.target.value })}
          >
            {Object.entries({
              "": "Sem preferência",
              pt: "Português",
              en: "English",
              es: "Español",
              fr: "Français",
              de: "Deutsch",
              zh: "中文",
            }).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
