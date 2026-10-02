export type Operational = {
  latitude: string;
  longitude: string;
  closures: string;
  observations: string;
  reservations: string;
};
export const operationalLabels = {
  latitude: "Latitude",
  longitude: "Longitude",
  closures: "Dias e datas de encerramento",
  observations: "Observações e condições de funcionamento",
  reservations: "Reservas e condições",
};
export function operationalFromSource(raw: Record<string, unknown>): Operational {
  return {
    latitude: String(raw.latitude ?? ""),
    longitude: String(raw.longitude ?? ""),
    closures: String(raw.dias_de_encerramento ?? raw.encerramento_base_reconfirmar ?? ""),
    observations: String(raw.observacoes ?? raw.observacoes_da_base ?? ""),
    reservations: String(raw.necessidade_de_reserva ?? raw.reservas_condicoes_base ?? ""),
  };
}
export function validateOperational(value: unknown): asserts value is Operational {
  if (!value || typeof value !== "object") throw new Error("Dados operacionais inválidos.");
  const v = value as Operational;
  for (const key of Object.keys(operationalLabels) as (keyof Operational)[])
    if (typeof v[key] !== "string" || v[key].length > 4000)
      throw new Error("Dados operacionais inválidos.");
  for (const [key, limit] of [
    ["latitude", 90],
    ["longitude", 180],
  ] as const)
    if (
      v[key] !== "" &&
      (!/^-?\d+(?:[.,]\d+)?$/.test(v[key]) || Math.abs(Number(v[key].replace(",", "."))) > limit)
    )
      throw new Error("Coordenadas inválidas.");
  if (Boolean(v.latitude) !== Boolean(v.longitude))
    throw new Error("Preencha ambas as coordenadas ou deixe ambas vazias.");
}
