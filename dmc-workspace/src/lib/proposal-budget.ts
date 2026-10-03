import { validatePricing, type CatalogPricing } from "./catalog-schema.ts";
import type { Snapshot } from "./itinerary-pdf";

export type BudgetLine = {
  description: string;
  quantity: number | null;
  unit: string;
  unitCents: number | null;
  subtotalCents: number | null;
  currency: string | null;
  status: "Confirmado" | "Estimativa" | "Por confirmar";
  notes: string;
};

// Legacy prose is only calculated when the complete value has an unambiguous unit.
function parsePrice(value: string): CatalogPricing | undefined {
  const match = value
    .trim()
    .match(
      /^(\d{1,9}(?:[.,]\d{1,2})?)\s*(EUR|USD|GBP|CHF|CNY|€)\s*(?:·\s*)?(?:por |\/)(pessoa|grupo|serviço|hora)(?:\s*·\s*(Confirmado|Estimado|Por confirmar))?$/i,
    );
  if (!match) return;
  return {
    amount: match[1],
    currency: match[2] === "€" ? "EUR" : match[2].toUpperCase(),
    unit: ({ pessoa: "person", grupo: "group", serviço: "service", hora: "hour" } as const)[
      match[3].toLowerCase() as "pessoa"
    ],
    status: match[4]?.toLowerCase() === "por confirmar" ? "pending" : "estimated",
  };
}

export function proposalBudget(snapshot: Snapshot) {
  const lines: BudgetLine[] = [];
  const terms: { description: string; inclusions: string; exclusions: string; taxes: string }[] =
    [];
  for (const day of snapshot.itinerary)
    for (const item of day.items) {
      const details = item.catalogDetails;
      const raw = item.confirmation
        ? item.confirmation.price
        : (details?.price ?? item.priceNote ?? "");
      let pricing = parsePrice(raw);
      // A cleared or changed trip price must never fall back to the catalogue's old value.
      if ((!item.confirmation || (raw.trim() && raw === details?.price)) && details?.pricing)
        pricing = details.pricing;
      if (pricing) {
        try {
          validatePricing(pricing);
        } catch {
          pricing = undefined;
        }
      }
      const known = pricing && pricing.status !== "pending" && pricing.amount !== "";
      const unitCents =
        known && pricing ? Math.round(Number(pricing.amount.replace(",", ".")) * 100) : null;
      // Billable hours cannot be inferred from visit duration; they need explicit confirmation.
      const quantity =
        pricing?.unit === "person"
          ? snapshot.brief.adults + snapshot.brief.children
          : pricing?.unit === "group" || pricing?.unit === "service"
            ? 1
            : null;
      const subtotalCents = unitCents !== null && quantity !== null ? unitCents * quantity : null;
      lines.push({
        description: `Dia ${day.dayNumber} · ${item.title}`,
        quantity,
        unit:
          pricing?.unit === "person"
            ? "pessoa"
            : pricing?.unit === "group"
              ? "grupo"
              : pricing?.unit === "service"
                ? "serviço"
                : pricing?.unit === "hour"
                  ? "hora"
                  : "",
        unitCents,
        subtotalCents,
        currency: pricing?.currency ?? null,
        status:
          subtotalCents === null
            ? "Por confirmar"
            : item.confirmation?.status === "confirmed"
              ? "Confirmado"
              : "Estimativa",
        notes: raw,
      });
      terms.push({
        description: item.title,
        inclusions: details?.inclusions ?? "",
        exclusions: details?.exclusions ?? "",
        taxes: details?.taxes ?? "",
      });
      if (item.transitToNext)
        lines.push({
          description: `Deslocação: ${item.transitToNext.fromLocation} → ${item.transitToNext.toLocation}`,
          quantity: 1,
          unit: "serviço",
          unitCents: null,
          subtotalCents: null,
          currency: null,
          status: "Por confirmar",
          notes: "Preço ou inclusão na atividade por confirmar; não somado ao total.",
        });
    }
  const totals: Record<string, { confirmed: number; estimated: number }> = {};
  for (const line of lines)
    if (line.subtotalCents !== null && line.currency) {
      totals[line.currency] ??= { confirmed: 0, estimated: 0 };
      totals[line.currency][line.status === "Confirmado" ? "confirmed" : "estimated"] +=
        line.subtotalCents;
    }
  return {
    lines,
    terms,
    totals,
    incomplete: lines.length === 0 || lines.some((line) => line.subtotalCents === null),
  };
}
