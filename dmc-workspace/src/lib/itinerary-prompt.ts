import { outstandingChecks } from "./activity-confirmation.ts";
import { proposalBudget } from "./proposal-budget.ts";
import { languages, type Locale } from "./locales.ts";
import type { Snapshot, VersionMeta } from "./itinerary-pdf";
import { portalRequest } from "./python-portal.ts";

export function renderItineraryPrompt(
  snapshot: Snapshot,
  meta: Pick<VersionMeta, "tripId" | "version" | "createdAt" | "snapshotHash">,
  locale: Locale,
  instructions: string,
) {
  // Reutilizar as regras do editor/PDF; Python compõe apenas a entrega TXT.
  return portalRequest<string>("prompt", "", {
    snapshot,
    meta: {
      tripId: meta.tripId,
      version: meta.version,
      createdAt: meta.createdAt,
      snapshotHash: meta.snapshotHash,
    },
    locale,
    instructions,
    languageName: languages.find((language) => language.code === locale)?.name,
    budget: proposalBudget(snapshot),
    checks: snapshot.itinerary.map((day) => day.items.map(outstandingChecks)),
  });
}
