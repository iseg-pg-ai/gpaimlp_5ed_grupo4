import type { ItineraryDay } from "../types/index";

// Pontos do mapa da proposta: só as coordenadas que vieram do catálogo. Um ponto sem
// coordenadas fica numa lista à parte; nunca se inventa uma posição nem se assume «perto».
export type MapStop = {
  id: string;
  title: string;
  order: number;
  time: string;
  latitude: number;
  longitude: number;
};
export type MapDay = { dayNumber: number; date: string; stops: MapStop[] };
export type UnplacedStop = { dayNumber: number; title: string };

const valid = (lat: unknown, lon: unknown) =>
  typeof lat === "number" &&
  typeof lon === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180 &&
  !(lat === 0 && lon === 0);

export function proposalStops(itinerary: ItineraryDay[]): {
  days: MapDay[];
  unplaced: UnplacedStop[];
} {
  const unplaced: UnplacedStop[] = [];
  const days = itinerary.map((day) => {
    const stops: MapStop[] = [];
    day.items
      .filter((item) => item.category !== "free_time")
      .forEach((item, index) => {
        if (valid(item.latitude, item.longitude))
          stops.push({
            id: item.id,
            title: item.title,
            order: index + 1,
            time: item.time,
            latitude: item.latitude as number,
            longitude: item.longitude as number,
          });
        else unplaced.push({ dayNumber: day.dayNumber, title: item.title });
      });
    return { dayNumber: day.dayNumber, date: day.date, stops };
  });
  return { days, unplaced };
}
