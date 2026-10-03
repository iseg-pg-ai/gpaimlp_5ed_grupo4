import type { CustomerBrief } from "../types/index";
type Row = Record<string, unknown>;
const clean = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function durationMinutes(value: unknown): number | null {
  const s = clean(value).replace(/^(\d+)\s+horas?$/, "$1h");
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
      b =
        Number(m[3]) === 0 && Number(m[4] ?? 0) === 0
          ? 1440
          : Number(m[3]) * 60 + Number(m[4] ?? 0);
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
export function proposeSlot(
  row: Row,
  restaurant: boolean,
  brief: CustomerBrief,
  cursor: number,
  date: string,
) {
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
  const windows = datedWindows(row.horario || row.horario_base_reconfirmar, date);
  const closure = closureState(row.dias_de_encerramento ?? row.encerramento_base_reconfirmar, date);
  if (closure === "closed") return { kind: "unavailable" as const };
  if (!duration || !windows || closure === "unknown") return { kind: "unknown" as const };
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

const months = [
  "jan",
  "fev",
  "mar",
  "abr",
  "maio",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
export function datedWindows(value: unknown, date: string): [number, number][] | null {
  const plain = openingWindows(value);
  if (plain) return plain;
  const month = Number(date.slice(5, 7)) - 1,
    day = new Date(date + "T12:00:00Z").getUTCDay();
  const matches: [number, number][] = [];
  for (const part of clean(value).split(/;\s*/)) {
    const seasonal = part.match(/^(.*?)\s*\(([a-z]+)\.?[–-]([a-z]+)\.?\)$/);
    const weekly = part.match(/^([a-z]+)(?:[–-]([a-z]+))?\s+(\d.*)$/);
    if (seasonal) {
      const a = months.indexOf(seasonal[2]),
        b = months.indexOf(seasonal[3]);
      const windows = openingWindows(seasonal[1]);
      if (a < 0 || b < 0 || !windows) return null;
      if (a <= b ? month >= a && month <= b : month >= a || month <= b) matches.push(...windows);
    } else if (weekly) {
      const a = weekdays.indexOf(weekly[1].slice(0, 3)),
        b = weekdays.indexOf((weekly[2] ?? weekly[1]).slice(0, 3));
      const windows = openingWindows(weekly[3]);
      if (a < 0 || b < 0 || !windows) return null;
      if (a <= b ? day >= a && day <= b : day >= a || day <= b) matches.push(...windows);
    } else return null;
  }
  return matches.sort((a, b) => a[0] - b[0]);
}
export function closureState(value: unknown, date: string): "open" | "closed" | "unknown" {
  const text = clean(value);
  if (!text || /^(nenhum indicado|nenhum|nao indicado)$/.test(text)) return "open";
  const month = Number(date.slice(5, 7)) - 1,
    day = Number(date.slice(8, 10));
  let unknown = false;
  for (const part of text.split(/;\s*/)) {
    if (closedOn({ dias_de_encerramento: part }, date)) return "closed";
    if (/^(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?$/.test(part)) continue;
    const m = part.match(/^([\d ,e]+)\s+([a-z]+)\.?$/);
    if (m && months.includes(m[2])) {
      const days = m[1]
        .split(/[, e]+/)
        .filter(Boolean)
        .map(Number);
      if (days.some((d) => d < 1 || d > 31)) {
        unknown = true;
        continue;
      }
      if (month === months.indexOf(m[2]) && days.includes(day)) return "closed";
    } else unknown = true;
  }
  return unknown ? "unknown" : "open";
}
export function transferEstimate(from: Row | undefined, to: Row, minimum: number) {
  if (!from) return { minutes: 0, note: "" };
  const coords = [from.latitude, from.longitude, to.latitude, to.longitude];
  if (
    coords.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
    Math.abs(Number(coords[0])) > 90 ||
    Math.abs(Number(coords[2])) > 90 ||
    Math.abs(Number(coords[1])) > 180 ||
    Math.abs(Number(coords[3])) > 180
  )
    return {
      minutes: minimum,
      note: `Margem de ${minimum} min sem coordenadas completas; confirmar deslocação`,
    };
  const [a, b, c, d] = coords.map((v) => (Number(v) * Math.PI) / 180);
  const h = Math.sin((c - a) / 2) ** 2 + Math.cos(a) * Math.cos(c) * Math.sin((d - b) / 2) ** 2;
  const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  const minutes = Math.max(minimum, Math.ceil(((distance * 1.5) / 25) * 60 + 10));
  return {
    minutes,
    note: `Deslocação estimada: ${minutes} min; ${distance.toFixed(1)} km em linha reta, fator 1,5 e 25 km/h + 10 min. Sem rota ou trânsito verificados.`,
  };
}
