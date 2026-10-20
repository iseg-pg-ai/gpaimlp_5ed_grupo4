export type ObservatoryRecord = {
  key: string;
  name: string | null;
  kind: string;
  category: string | null;
  destination: string | null;
  location: string | null;
  scope: string | null;
  locationRule: string | null;
  description: string | null;
  source: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  details: Record<string, string | number | null>;
  historicalRoutes: string[] | null;
};
export type ObservatoryPrice = {
  id: string;
  name: string | null;
  category: string | null;
  location: string | null;
  destination: string | null;
  unit: string | null;
  rawUnit: string | null;
  nature: string | null;
  currency: string;
  reference: number | null;
  adult: number | null;
  senior: number | null;
  child: number | null;
  conditions: string | null;
  source: string | null;
  state: string | null;
};
export type FieldEvidence = {
  entity_key: string;
  name: string;
  field_label: string;
  confirmation: string;
  temporal_state: string;
  verified_on: string | null;
  valid_from: string | null;
  valid_until: string | null;
  evidence_source: string | null;
  commercially_usable: boolean;
};
export type ObservatoryData = {
  evaluatedOn: string;
  records: ObservatoryRecord[];
  prices: ObservatoryPrice[];
  evidence: FieldEvidence[];
  history: {
    available: boolean;
    routeCount: number | null;
    documentCount: number | null;
    datedCount: number | null;
    activities: { name: string | null; location: string | null; route: string | null }[];
  };
  validation: { status: string; issues: number } | null;
  gaps: { table: string; field: string; missing: number; records: number }[];
  conflicts: { table: string; record: string; field: string }[];
  outlines: number[][][];
};
export const display = (value: unknown): string =>
  value === null || value === undefined || String(value).trim() === ""
    ? "Por confirmar"
    : String(value);
export function hasCoordinates(record: ObservatoryRecord) {
  if (
    record.latitude === null ||
    record.longitude === null ||
    String(record.latitude).trim() === "" ||
    String(record.longitude).trim() === ""
  )
    return false;
  const lat = Number(record.latitude),
    lon = Number(record.longitude);
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}
export function comparableMedian(prices: ObservatoryPrice[]): number | null {
  if (!prices.length || prices.some((row) => !row.unit || row.unit === "Por confirmar"))
    return null;
  const groups = new Set(
    prices.map((row) =>
      JSON.stringify([row.category, row.unit, row.rawUnit, row.nature, row.currency]),
    ),
  );
  if (groups.size !== 1 || prices.some((row) => !row.category || !row.rawUnit || !row.nature))
    return null;
  const values = prices
    .flatMap((row) =>
      typeof row.reference === "number" && Number.isFinite(row.reference) ? [row.reference] : [],
    )
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
