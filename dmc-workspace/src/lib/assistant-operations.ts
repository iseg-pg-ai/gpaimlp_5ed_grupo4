import { VersionStore } from "./version-store.ts";
import { FeedbackStore } from "./feedback-store.ts";
import { HistoricalCases } from "./historical-cases.ts";
import { AgentAuditStore } from "./agent-audit-store.ts";
import { proposalDiagnostics } from "./proposal-diagnostics.ts";
import { loadPublishedCatalog, CatalogStore } from "./catalog-store.ts";
import { proposalBudget } from "./proposal-budget.ts";
import { proposalImpact } from "./assistant-impact.ts";
import { isLocale } from "./locales.ts";
import { resolveChineseFont } from "./itinerary-pdf.ts";
import { readDayWeather } from "./weather-provider.ts";
import type { DayWeatherResult } from "./weather.ts";

export async function readOperations(
  tripId?: string,
  version?: number,
  query = "",
  compareVersion?: number,
  locale = "pt",
  fetchWeather = false,
) {
  const store = new VersionStore();
  try {
    const feedback = new FeedbackStore(store);
    const cases = new HistoricalCases(feedback);
    const audit = new AgentAuditStore(store);
    const versions = store.list();
    const selected = tripId && version ? { tripId, version } : versions[0];
    const snapshot = selected ? feedback.snapshot(selected.tripId, selected.version) : null;
    const catalog = await loadPublishedCatalog();
    const records = await new CatalogStore().list();
    const weather: Record<number, DayWeatherResult> = {};
    if (fetchWeather && snapshot)
      for (const day of snapshot.itinerary.slice(0, 3)) {
        try {
          weather[day.dayNumber] = await readDayWeather({
            date: day.date,
            location: day.location,
            items: day.items.map((item) => ({
              latitude: item.latitude,
              longitude: item.longitude,
            })),
          });
        } catch {
          weather[day.dayNumber] = {
            status: "unavailable",
            messagePt: "Meteorologia indisponível.",
            messageEn: "Weather unavailable.",
          };
        }
      }
    const diagnostics = snapshot ? proposalDiagnostics(snapshot, catalog, weather) : [];
    if (!isLocale(locale)) throw new Error("Idioma de entrega inválido.");
    if (locale === "zh" && !resolveChineseFont())
      diagnostics.push({
        code: "CJK_FONT",
        severity: "blocker",
        message: "Configure uma fonte CJK antes do PDF em mandarim.",
        source: "Ambiente de exportação",
      });
    return {
      versions,
      weather,
      selected: selected ? { tripId: selected.tripId, version: selected.version } : null,
      snapshot,
      feedback: feedback.list(),
      responses: selected ? feedback.items(selected.tripId, selected.version) : [],
      quality: feedback.quality(),
      metrics: audit.metrics(),
      cases: snapshot ? cases.search(snapshot, query) : [],
      diagnostics,
      budget: snapshot ? proposalBudget(snapshot) : null,
      comparison:
        snapshot && compareVersion && selected
          ? proposalImpact(feedback.snapshot(selected.tripId, compareVersion), snapshot)
          : null,
      records: records.map((record) => ({
        id: record.id,
        category: record.category,
        name: record.fields.name,
        status: record.status,
        revision: record.revision,
        updatedAt: record.updatedAt,
        issues: [
          ...(!record.fields.description ? ["Descrição em falta"] : []),
          ...(!record.fields.price && !record.pricing ? ["Preço em falta"] : []),
          ...(Date.parse(record.updatedAt) < Date.now() - 180 * 86400000
            ? ["Revisão com mais de 180 dias"]
            : []),
          ...(records.some(
            (other) =>
              other.id !== record.id &&
              other.category === record.category &&
              other.fields.name.trim().toLocaleLowerCase("pt") ===
                record.fields.name.trim().toLocaleLowerCase("pt"),
          )
            ? ["Possível duplicado"]
            : []),
        ],
      })),
    };
  } finally {
    store.close();
  }
}
export type OperationsData = Awaited<ReturnType<typeof readOperations>>;
