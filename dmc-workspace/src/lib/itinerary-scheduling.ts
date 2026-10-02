import type { CustomerBrief } from "../types/index";
type Row = Record<string, unknown>;
const clean = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function durationMinutes(value: unknown): number | null {
  const s = clean(value);
  const minute = s.match(/^(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:min|minutos)$/);
  if (minute) {
    const n = Number(minute[2] ?? minute[1]);
    return n > 0 && n <= 720 && n >= Number(minute[1]) ? n : null;
  }
  const hours = s.match(/^(\d+)\s*h(?:(\d{1,2}))?(?:\s*[–-]\s*(\d+)\s*h(?:(\d{1,2}))?)?$/);
  if (hours) {
    if (Number(hours[2] ?? 0) > 59 || Number(hours[4] ?? 0) > 59) return null;
    const n =
      Number(hours[3] ?? hours[1]) * 60 + Number(hours[3] ? (hours[4] ?? 0) : (hours[2] ?? 0));
    return n > 0 && n <= 720 && n >= Number(hours[1]) * 60 + Number(hours[2] ?? 0) ? n : null;
  }
  return null;
}
export function openingWindows(value: unknown): [number, number][] | null {
  const s = clean(value).replace(/^(todos os dias|diariamente|daily)\s*/, "");
  const parts = s.split(/\s*[;,]\s*/);
  const windows: [number, number][] = [];
  for (const part of parts) {
    const m = part.match(/^(\d{1,2})(?::|h)(\d{2})?\s*[–-]\s*(\d{1,2})(?::|h)(\d{2})?$/);
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2] ?? 0),
      b = Number(m[3]) * 60 + Number(m[4] ?? 0);
    if (
      Number(m[1]) > 23 ||
      Number(m[3]) > 24 ||
      Number(m[2] ?? 0) > 59 ||
      Number(m[4] ?? 0) > 59 ||
      b > 1440 ||
      a >= b
    )
      return null;
    windows.push([a, b]);
  }
  return windows.sort((a, b) => a[0] - b[0]);
}
export function closedOn(row: Row, date: string): boolean {
  const value = clean(row.dias_de_encerramento ?? row.encerramento_base_reconfirmar);
  const names = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const day = names[new Date(date + "T12:00:00Z").getUTCDay()];
  return value
    .split(/[;,]/)
    .some((part) =>
      new RegExp(`^(?:encerrado(?:s)?(?: a| aos| as)?\\s+)?${day}(?:-feira)?$`).test(part.trim()),
    );
}
export function knownCost(row: Row, people: number): number | null {
  const p = row._pricing as
    | { amount?: string; currency?: string; unit?: string; status?: string }
    | undefined;
  if (p) {
    if (
      p.currency !== "EUR" ||
      p.status === "pending" ||
      !p.amount ||
      !/^\d+(?:[.,]\d{1,2})?$/.test(p.amount)
    )
      return null;
    const n = Number(p.amount.replace(",", "."));
    return p.unit === "person" ? n * people : p.unit === "group" || p.unit === "service" ? n : null;
  }
  const price = (row._matching as { pricePerPerson?: number } | undefined)?.pricePerPerson;
  return typeof price === "number" && Number.isFinite(price) && price >= 0 ? price * people : null;
}
export function proposeSlot(row: Row, restaurant: boolean, brief: CustomerBrief, cursor: number) {
  const duration = restaurant
    ? Math.max(
        durationMinutes(row.duracao_blu_estimativa) ?? 0,
        brief.diningPace.startsWith("Quick")
          ? 40
          : brief.diningPace.startsWith("Tasting")
            ? 120
            : 90,
      )
    : durationMinutes(row.tempo_medio_de_visita ?? row.duracao);
  const windows = openingWindows(row.horario || row.horario_base_reconfirmar);
  const closures = clean(row.dias_de_encerramento ?? row.encerramento_base_reconfirmar);
  // Complex seasonal/date-specific closures must be reviewed rather than guessed.
  const simpleClosures =
    !closures ||
    /^(nenhum indicado|nenhum|nao indicado)$/.test(closures) ||
    closures
      .split(/[;,]/)
      .every((v) => /^(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?$/.test(v.trim()));
  if (!duration || !windows || !simpleClosures) return { kind: "unknown" as const };
  for (const [open, close] of windows) {
    const start = Math.max(cursor, open, restaurant ? 12 * 60 : 0);
    const end = start + duration;
    if (end <= Math.min(close, 18 * 60) && (!restaurant || start <= 14 * 60))
      return { kind: "scheduled" as const, start, end, duration };
  }
  return { kind: "unavailable" as const };
}
export const clockTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
