import { subcategories } from "./catalog-schema.ts";
export type Personalization = {
  mustHave: string[];
  avoid: string[];
  budgetFlex: number;
  extraBreaks: boolean;
  groupNeeds: string;
  accompaniment: "any" | "guided" | "independent" | "private";
  guideLanguage: string;
};
export const emptyPersonalization = (): Personalization => ({
  mustHave: [],
  avoid: [],
  budgetFlex: 0,
  extraBreaks: false,
  groupNeeds: "",
  accompaniment: "any",
  guideLanguage: "",
});
export const accompanimentLabels = {
  any: "Sem preferência",
  guided: "Com guia",
  independent: "Sem guia",
  private: "Acompanhamento privado",
};
export function validatePersonalization(value: unknown): asserts value is Personalization {
  if (!value || typeof value !== "object")
    throw new Error("Preferências de personalização inválidas.");
  const p = value as Personalization;
  const options = Object.values(subcategories).flat();
  for (const key of ["mustHave", "avoid"] as const)
    if (
      !Array.isArray(p[key]) ||
      p[key].length > options.length ||
      new Set(p[key]).size !== p[key].length ||
      p[key].some((v) => !options.includes(v))
    )
      throw new Error("Subcategorias do briefing inválidas.");
  if (p.mustHave.some((v) => p.avoid.includes(v)))
    throw new Error("Uma opção não pode ser imperdível e a evitar ao mesmo tempo.");
  if (
    ![0, 10, 20].includes(p.budgetFlex) ||
    typeof p.extraBreaks !== "boolean" ||
    !Object.hasOwn(accompanimentLabels, p.accompaniment) ||
    typeof p.groupNeeds !== "string" ||
    p.groupNeeds.length > 4000 ||
    typeof p.guideLanguage !== "string" ||
    !["", "pt", "en", "es", "fr", "de", "zh"].includes(p.guideLanguage)
  )
    throw new Error("Preferências de personalização inválidas.");
}
export function accompanimentMatches(
  modality: unknown,
  preference: Personalization["accompaniment"],
) {
  if (preference === "any") return true;
  const value = String(modality ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const allowed = {
    guided: ["guiada", "guiado", "visita guiada", "guided", "com guia"],
    independent: ["autoguiada", "autoguiado", "self-guided", "sem guia", "independente"],
    private: ["privada", "privado", "private", "acompanhamento privado"],
  };
  return allowed[preference].includes(value);
}
