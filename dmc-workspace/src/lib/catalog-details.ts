import {
  formatPricing,
  validatePricing,
  type CatalogPricing,
  type CatalogRecord,
} from "./catalog-schema.ts";

export type CatalogDetails = {
  pricing?: CatalogPricing;
  inclusions?: string;
  exclusions?: string;
  taxes?: string;
  location: string;
  price: string;
  supplier: string;
  contact: string;
  hours: string;
  accessibility: string;
  dietary: string;
  verification: string;
};

const fields: (keyof CatalogDetails)[] = [
  "location",
  "price",
  "supplier",
  "contact",
  "hours",
  "accessibility",
  "dietary",
  "verification",
];

export function validateCatalogDetails(value: unknown): asserts value is CatalogDetails {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Dados de catálogo inválidos.");
  const details = value as Record<string, unknown>;
  if (details.pricing !== undefined) validatePricing(details.pricing);
  for (const key of ["inclusions", "exclusions", "taxes"])
    if (
      details[key] !== undefined &&
      (typeof details[key] !== "string" || (details[key] as string).length > 20000)
    )
      throw new Error("Condições de preço inválidas.");
  if (
    fields.some(
      (key) => typeof details[key] !== "string" || (details[key] as string).length > 20000,
    )
  )
    throw new Error("Dados de catálogo inválidos.");
}

export function detailsFromRecord(record: CatalogRecord): CatalogDetails {
  const f = record.fields;
  return {
    ...(record.pricing ? { pricing: { ...record.pricing } } : {}),
    inclusions: String(record.raw.inclusoes ?? ""),
    exclusions: String(record.raw.exclusoes ?? ""),
    taxes: String(record.raw.impostos_taxas ?? ""),
    location: f.address || f.location,
    price: record.pricing
      ? `${formatPricing(record.pricing)}${f.price ? ` — ${f.price}` : ""}`
      : f.price,
    supplier: f.provider || (record.category === "restaurantes" ? f.name : ""),
    contact: f.contacts,
    hours: [
      f.hours,
      record.operational?.closures ??
        record.raw.dias_de_encerramento ??
        record.raw.encerramento_base_reconfirmar,
      record.operational?.observations ?? record.raw.observacoes,
    ]
      .filter(Boolean)
      .join(" · "),
    accessibility: f.accessibility,
    dietary: f.dietary,
    verification: record.matching?.verificationNotes ?? "",
  };
}
