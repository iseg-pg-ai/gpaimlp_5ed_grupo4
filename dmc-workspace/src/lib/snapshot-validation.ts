import { validateConfirmation } from "./activity-confirmation.ts";
import { validateCatalogDetails } from "./catalog-details.ts";
import { validateBrief } from "./curation.ts";
import type { Snapshot } from "./itinerary-pdf";

export function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (!value || typeof value !== "object") throw new Error("Roteiro inválido.");
  const s = value as Snapshot;
  validateBrief(s.brief);
  const string = (v: unknown, max = 20000) => typeof v === "string" && v.length <= max;
  const list = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every((x) => string(x));
  if (
    !list(s.pending) ||
    !Array.isArray(s.itinerary) ||
    !s.itinerary.length ||
    s.itinerary.length > 31
  )
    throw new Error("Dias ou pendências inválidos.");
  for (const [index, day] of s.itinerary.entries()) {
    if (
      !day ||
      day.dayNumber !== index + 1 ||
      !string(day.date, 100) ||
      !string(day.title) ||
      !string(day.location) ||
      (day.summary !== undefined && !string(day.summary)) ||
      !Array.isArray(day.items) ||
      day.items.length > 100
    )
      throw new Error("Dia inválido.");
    for (const item of day.items) {
      if (!item || !string(item.id) || !string(item.time) || !string(item.title))
        throw new Error("Atividade inválida.");
      for (const key of [
        "description",
        "location",
        "duration",
        "priceNote",
        "dietaryNotes",
        "accessibilityNotes",
        "source",
      ] as const)
        if (item[key] !== undefined && !string(item[key]))
          throw new Error("Texto de atividade inválido.");
      for (const key of ["pendingChecks", "appliedRules"] as const)
        if (item[key] !== undefined && !list(item[key]))
          throw new Error("Detalhes de atividade inválidos.");
      if (item.confirmation !== undefined) validateConfirmation(item, item.confirmation);
      if (item.catalogDetails !== undefined) validateCatalogDetails(item.catalogDetails);
      if (
        item.transitToNext &&
        [
          item.transitToNext.fromLocation,
          item.transitToNext.toLocation,
          item.transitToNext.mode,
          item.transitToNext.duration,
        ].some((v) => !string(v))
      )
        throw new Error("Deslocação inválida.");
    }
  }
}
