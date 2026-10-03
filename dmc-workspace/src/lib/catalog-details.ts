import { formatPricing, type CatalogRecord } from "./catalog-schema.ts";

export type CatalogDetails = {
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
    location: f.address || f.location,
    price: record.pricing
      ? `${formatPricing(record.pricing)}${f.price ? ` — ${f.price}` : ""}`
      : f.price,
    supplier: f.provider || (record.category === "restaurantes" ? f.name : ""),
    contact: f.contacts,
    hours: f.hours,
    accessibility: f.accessibility,
    dietary: f.dietary,
    verification: record.matching?.verificationNotes ?? "",
  };
}
