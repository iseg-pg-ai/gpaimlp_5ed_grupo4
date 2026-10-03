import { validateOperational, type Operational } from "./catalog-operational.ts";
import { validateMatching, type MatchingProfile } from "./catalog-matching.ts";
export const categories = ["atracoes", "restaurantes", "experiencias"] as const;
export type Category = (typeof categories)[number];
export const statuses = ["draft", "review", "approved", "inactive"] as const;
export type CatalogStatus = (typeof statuses)[number];
export const categoryLabels = {
  atracoes: "Atividades",
  restaurantes: "Restaurantes",
  experiencias: "Experiências",
};
export const statusLabels = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  inactive: "Inativo",
};
export const fieldLabels = {
  name: "Nome",
  location: "Localização / cidade",
  address: "Morada",
  description: "Descrição",
  duration: "Duração",
  price: "Preço de referência / notas",
  contacts: "Contactos",
  accessibility: "Acessibilidade e condições",
  source: "Fonte",
  effort: "Esforço físico",
  kind: "Tipo de atividade",
  hours: "Horários e encerramentos",
  cuisine: "Tipo de cozinha",
  dietary: "Opções alimentares e alergénios",
  provider: "Fornecedor",
  modality: "Modalidade da experiência",
} as const;
export type Fields = Record<keyof typeof fieldLabels, string>;
export type CatalogRecord = {
  id: string;
  category: Category;
  status: CatalogStatus;
  revision: number;
  fields: Fields;
  operational?: Operational;
  sourceData?: Record<string, unknown>;
  subcategory?: string;
  pricing?: CatalogPricing;
  matching?: MatchingProfile;
  raw: Record<string, unknown>;
  updatedAt: string;
  reason: string;
};
export type CatalogInput = {
  id?: string;
  category: Category;
  status: CatalogStatus;
  baseRevision: number | null;
  fields: Fields;
  operational?: Operational;
  sourceData?: Record<string, unknown>;
  subcategory?: string;
  pricing?: CatalogPricing;
  matching?: MatchingProfile;
  reason: string;
};
export const emptyFields = (): Fields =>
  Object.fromEntries(Object.keys(fieldLabels).map((k) => [k, ""])) as Fields;
export function validateCatalogInput(value: unknown): asserts value is CatalogInput {
  if (!value || typeof value !== "object") throw new Error("Registo inválido.");
  const v = value as CatalogInput;
  if (v.operational !== undefined) validateOperational(v.operational);
  if (v.pricing !== undefined) validatePricing(v.pricing);
  if (v.matching !== undefined) validateMatching(v.matching);
  if (!categories.includes(v.category) || !statuses.includes(v.status))
    throw new Error("Categoria ou estado inválido.");
  if (
    v.subcategory !== undefined &&
    (typeof v.subcategory !== "string" ||
      (v.subcategory !== "" && !subcategories[v.category].includes(v.subcategory)))
  )
    throw new Error("Subcategoria inválida para a categoria selecionada.");
  if (v.id !== undefined && (typeof v.id !== "string" || !/^cat-[a-z0-9-]{16,64}$/.test(v.id)))
    throw new Error("Identificador inválido.");
  if (
    v.id
      ? !Number.isSafeInteger(v.baseRevision) || Number(v.baseRevision) < 1
      : v.baseRevision !== null
  )
    throw new Error("Revisão inválida.");
  if (
    !v.fields ||
    Object.keys(fieldLabels).some(
      (k) =>
        typeof v.fields[k as keyof Fields] !== "string" ||
        v.fields[k as keyof Fields].length > 4000,
    )
  )
    throw new Error("Campos inválidos (máximo 4000 caracteres).");
  if (!v.fields.name.trim() || v.fields.name.length > 200)
    throw new Error("Indique um nome até 200 caracteres.");
  if (typeof v.reason !== "string" || !v.reason.trim() || v.reason.length > 500)
    throw new Error("Indique o motivo da alteração (até 500 caracteres).");
  if (
    v.status === "approved" &&
    !["Baixo", "Moderado", "Alto", "Por confirmar"].includes(v.fields.effort)
  )
    throw new Error("Escolha um nível de esforço antes de aprovar.");
  if (
    v.status === "approved" &&
    approvalFields.some((k) => (k === "price" && v.pricing ? false : !v.fields[k].trim()))
  )
    throw new Error(
      "Para aprovar, preencha localização, descrição, duração, preço, fonte, acessibilidade e esforço.",
    );
}

export const approvalFields: (keyof Fields)[] = [
  "name",
  "location",
  "description",
  "duration",
  "price",
  "source",
  "accessibility",
  "effort",
];
export const priceUnits = {
  person: "Por pessoa",
  group: "Por grupo",
  hour: "Por hora",
  service: "Por serviço",
} as const;
export const priceStatuses = {
  confirmed: "Confirmado",
  estimated: "Estimado",
  pending: "Por confirmar",
} as const;
export type CatalogPricing = {
  amount: string;
  currency: string;
  unit: keyof typeof priceUnits | "";
  status: keyof typeof priceStatuses;
};
export const emptyPricing = (): CatalogPricing => ({
  amount: "",
  currency: "EUR",
  unit: "",
  status: "pending",
});
export function validatePricing(value: unknown): asserts value is CatalogPricing {
  if (!value || typeof value !== "object") throw new Error("Preço inválido.");
  const p = value as CatalogPricing;
  if (
    !Object.hasOwn(priceStatuses, p.status) ||
    typeof p.currency !== "string" ||
    !/^[A-Z]{3}$/.test(p.currency) ||
    !Object.hasOwn(priceUnits, p.unit)
  )
    throw new Error("Indique moeda (três letras), unidade e estado do preço.");
  if (
    typeof p.amount !== "string" ||
    (p.amount !== "" && !/^\d{1,9}(?:[.,]\d{1,2})?$/.test(p.amount)) ||
    (p.status !== "pending" && !p.amount)
  )
    throw new Error(
      "Indique um preço não negativo com até duas casas decimais, ou escolha Por confirmar.",
    );
}
export function formatPricing(p: CatalogPricing): string {
  return `${p.amount ? `${p.amount.replace(",", ".")} ${p.currency}` : "Valor por confirmar"} · ${priceUnits[p.unit as keyof typeof priceUnits] ?? ""} · ${priceStatuses[p.status]}`;
}
export function visibleFields(category: Category): (keyof Fields)[] {
  return (Object.keys(fieldLabels) as (keyof Fields)[]).filter((key) => {
    if (["cuisine", "dietary"].includes(key)) return category === "restaurantes";
    if (["provider", "modality"].includes(key)) return category === "experiencias";
    return key !== "kind" || category !== "restaurantes";
  });
}
export const fieldGroups: { title: string; fields: (keyof Fields)[] }[] = [
  {
    title: "Identificação e descrição",
    fields: ["name", "description", "kind", "cuisine", "provider", "modality"],
  },
  {
    title: "Localização e logística",
    fields: ["location", "address", "duration", "hours", "contacts"],
  },
  { title: "Condições e acessibilidade", fields: ["accessibility", "effort", "dietary"] },
  { title: "Preços", fields: ["price"] },
  { title: "Fonte", fields: ["source"] },
];
export function groupProgress(input: CatalogInput, keys: (keyof Fields)[]) {
  if (keys.includes("price") && input.pricing) {
    const p = input.pricing;
    const checks = [
      /^[A-Z]{3}$/.test(p.currency),
      Object.hasOwn(priceUnits, p.unit),
      Object.hasOwn(priceStatuses, p.status),
    ];
    if (p.status !== "pending" || p.amount) checks.push(/^\d{1,9}(?:[.,]\d{1,2})?$/.test(p.amount));
    return {
      missing: checks.every(Boolean) ? [] : ["price" as keyof Fields],
      total: checks.length,
      percent: Math.round((100 * checks.filter(Boolean).length) / checks.length),
    };
  }
  const required = keys.filter(
    (k) => visibleFields(input.category).includes(k) && approvalFields.includes(k),
  );
  const missing = required.filter((k) => {
    if (k === "price" && input.pricing) {
      try {
        validatePricing(input.pricing);
        return false;
      } catch {
        return true;
      }
    }
    if (k === "effort")
      return !["Baixo", "Moderado", "Alto", "Por confirmar"].includes(input.fields[k]);
    return !input.fields[k].trim();
  });
  return {
    missing,
    total: required.length,
    percent: required.length
      ? Math.round((100 * (required.length - missing.length)) / required.length)
      : 100,
  };
}

export const subcategories: Record<Category, string[]> = {
  atracoes: [
    "Museu e galeria",
    "Monumento e património histórico",
    "Visita religiosa",
    "Passeio urbano e bairro histórico",
    "Mercado e comércio local",
    "Jardim e parque",
    "Natureza e caminhada",
    "Praia e atividade costeira",
    "Miradouro e paisagem",
    "Espetáculo e evento cultural",
    "Atividade desportiva e aventura",
    "Passeio de barco",
    "Parque temático e de lazer",
  ],
  experiencias: [
    "Visita guiada",
    "Experiência gastronómica",
    "Prova de vinhos e enoturismo",
    "Workshop e artesanato",
    "Experiência cultural e tradições",
    "Experiência de natureza e aventura",
    "Experiência náutica",
    "Bem-estar e relaxamento",
  ],
  restaurantes: [
    "Cozinha tradicional portuguesa",
    "Cozinha regional",
    "Peixe e marisco",
    "Grelhados e carnes",
    "Cozinha internacional",
    "Cozinha de autor e fine dining",
    "Vegetariano e vegan",
    "Petiscos e tapas",
    "Café, pastelaria e brunch",
  ],
};
