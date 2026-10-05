import type {
  ActivityItem,
  DailyRouteSummary,
  ItineraryDay,
  TransitLeg,
  TransitMode,
} from "../types/index";
import { clockTime, durationMinutes } from "./itinerary-scheduling.ts";

interface LocationCoords {
  latitude?: number | null;
  longitude?: number | null;
  title: string;
}

const OSRM_URL = process.env.OSRM_ROUTER_URL || "http://router.project-osrm.org";

/**
 * Calculates real road distance and travel duration between two coordinates using OSRM.
 * Supports driving and walking profiles, and falls back to Haversine if OSRM is unreachable or coordinates are missing.
 */
export async function calculateRoadLeg(
  from: LocationCoords,
  to: LocationCoords,
  optionsOrTimeout?:
    | number
    | {
        preferredMode?: TransitMode;
        bufferMinutes?: number;
        timeoutMs?: number;
      },
  legacyTimeoutMs = 3000,
): Promise<TransitLeg | null> {
  const timeoutMs =
    typeof optionsOrTimeout === "number"
      ? optionsOrTimeout
      : optionsOrTimeout?.timeoutMs ?? legacyTimeoutMs;
  const preferredMode =
    typeof optionsOrTimeout === "object" ? optionsOrTimeout?.preferredMode : undefined;
  const customBuffer =
    typeof optionsOrTimeout === "object" ? optionsOrTimeout?.bufferMinutes : undefined;

  const hasCoords =
    typeof from.latitude === "number" &&
    typeof from.longitude === "number" &&
    typeof to.latitude === "number" &&
    typeof to.longitude === "number" &&
    Number.isFinite(from.latitude) &&
    Number.isFinite(from.longitude) &&
    Number.isFinite(to.latitude) &&
    Number.isFinite(to.longitude);

  if (!hasCoords) {
    const fallbackMode: TransitMode = preferredMode ?? "chauffeur";
    return {
      id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
      fromLocation: from.title,
      toLocation: to.title,
      mode: fallbackMode,
      duration: fallbackMode === "walk" ? "20 min" : "15 min",
      distance: "Por confirmar",
      routeNote: "Coordenadas incompletas; estimativa padrão de deslocação",
      bufferMinutes: customBuffer ?? (fallbackMode === "walk" ? 5 : 15),
      isAlgorithmOptimized: false,
      algorithmNote: "Sem coordenadas precisas no catálogo; tempo de reserva atribuído.",
    };
  }

  const lat1 = from.latitude!;
  const lon1 = from.longitude!;
  const lat2 = to.latitude!;
  const lon2 = to.longitude!;
  const profile = preferredMode === "walk" ? "walking" : "driving";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${OSRM_URL}/route/v1/${profile}/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const meters = Math.round(route.distance);
        const km = meters / 1000;
        const distStr = meters < 1000 ? `${meters} m` : `${km.toFixed(1)} km`;

        // If preferredMode is set, honor it. Otherwise auto-detect: walk if <= 1000m, chauffeur otherwise
        const mode: TransitMode = preferredMode ?? (meters <= 1000 ? "walk" : "chauffeur");

        let minutes = 1;
        if (mode === "walk") {
          // Standard urban pedestrian speed ~ 4.5 km/h = 75 m/min
          minutes = Math.max(2, Math.round(meters / 75));
        } else if (mode === "boat") {
          // Scenic riverboat speed ~ 15 km/h + 5 min boarding
          minutes = Math.max(10, Math.round(meters / 250 + 5));
        } else if (mode === "train" || mode === "funicular") {
          minutes = Math.max(8, Math.round(meters / 400 + 5));
        } else {
          // chauffeur (driving from OSRM seconds)
          const seconds = Math.round(route.duration);
          minutes = Math.max(1, Math.round(seconds / 60));
        }

        const durStr = `${minutes} min`;
        const buffer = customBuffer ?? (mode === "walk" ? 5 : 10);

        let routeNote = `Trajeto de ${distStr} via estrada (~${durStr})`;
        if (mode === "walk") {
          routeNote = `Percurso pedonal de ${distStr} (~${durStr})`;
        } else if (mode === "boat") {
          routeNote = `Travessia cénica fluvial de ${distStr} (~${durStr})`;
        } else if (mode === "train") {
          routeNote = `Ligação ferroviária cénica de ${distStr} (~${durStr})`;
        } else if (mode === "funicular") {
          routeNote = `Subida/descida em transporte histórico/funicular (~${durStr})`;
        }

        return {
          id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
          fromLocation: from.title,
          toLocation: to.title,
          mode,
          duration: durStr,
          distance: distStr,
          routeNote,
          bufferMinutes: buffer,
          isAlgorithmOptimized: true,
          algorithmNote: `Percurso calculado pela malha viária real via OSRM (${profile}).`,
        };
      }
    }
  } catch {
    // Network timeout or offline fallback
  }

  // Fallback: Haversine straight-line distance with urban factor
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const straightKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));

  const fallbackMode: TransitMode = preferredMode ?? (straightKm <= 0.8 ? "walk" : "chauffeur");
  let estMins = 10;
  if (fallbackMode === "walk") {
    estMins = Math.max(5, Math.ceil(((straightKm * 1.3) / 4.5) * 60));
  } else {
    estMins = Math.max(10, Math.ceil(((straightKm * 1.5) / 25) * 60 + 10));
  }

  return {
    id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
    fromLocation: from.title,
    toLocation: to.title,
    mode: fallbackMode,
    duration: `${estMins} min`,
    distance: `${straightKm.toFixed(1)} km (estimado)`,
    routeNote: `Margem estimada: ~${estMins} min (${straightKm.toFixed(1)} km em linha reta)`,
    bufferMinutes: customBuffer ?? (fallbackMode === "walk" ? 5 : 10),
    isAlgorithmOptimized: false,
    algorithmNote: "Estimativa geométrica (fator urbano 1,5 a 25 km/h + tolerância).",
  };
}

const normKey = (s?: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function parseCoord(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const num = parseFloat(val.trim());
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

/**
 * Extracts coordinates from an activity item using its catalog details or raw data.
 */
function extractCoords(
  item: ActivityItem,
  rawCatalogMap?: Map<string, { latitude: number; longitude: number }>,
): LocationCoords {
  // 1. Direct coordinate properties on item
  const directLat = parseCoord(item.latitude);
  const directLon = parseCoord(item.longitude);
  if (directLat !== undefined && directLon !== undefined) {
    return {
      latitude: directLat,
      longitude: directLon,
      title: item.title,
    };
  }

  // 2. Lookup in catalog map with various possible keys
  if (rawCatalogMap) {
    const rawId = item.id.replace(/^[a-z_]+:/i, "");
    const candidate =
      rawCatalogMap.get(item.id) ??
      rawCatalogMap.get(normKey(item.id)) ??
      rawCatalogMap.get(rawId) ??
      rawCatalogMap.get(normKey(rawId)) ??
      rawCatalogMap.get(item.title) ??
      rawCatalogMap.get(normKey(item.title));

    if (candidate) {
      return {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        title: item.title,
      };
    }
  }

  return {
    latitude: undefined,
    longitude: undefined,
    title: item.title,
  };
}

/**
 * Builds a coordinate lookup map from raw catalog records.
 */
export function buildCoordMap(
  catalogRecords?: Array<Record<string, unknown>>,
): Map<string, { latitude: number; longitude: number }> {
  const coordMap = new Map<string, { latitude: number; longitude: number }>();
  if (!catalogRecords) return coordMap;

  for (const rec of catalogRecords) {
    const lat = parseCoord(rec.latitude);
    const lon = parseCoord(rec.longitude);
    if (lat !== undefined && lon !== undefined) {
      const coords = { latitude: lat, longitude: lon };

      // Key by raw ID
      if (rec.id) {
        const idStr = String(rec.id);
        coordMap.set(idStr, coords);
        coordMap.set(normKey(idStr), coords);
        coordMap.set(`atracoes:${idStr}`, coords);
        coordMap.set(`experiencias:${idStr}`, coords);
      }
      if (rec.id_blu) {
        const bluStr = String(rec.id_blu);
        coordMap.set(bluStr, coords);
        coordMap.set(normKey(bluStr), coords);
        coordMap.set(`restaurantes:${bluStr}`, coords);
      }

      // Key by catalog ID
      if (rec._catalog_id) {
        const catId = String(rec._catalog_id);
        coordMap.set(catId, coords);
        coordMap.set(normKey(catId), coords);
        coordMap.set(`atracoes:${catId}`, coords);
        coordMap.set(`experiencias:${catId}`, coords);
        coordMap.set(`restaurantes:${catId}`, coords);
      }

      // Key by name / title / establishment
      for (const key of ["nome_da_atracao", "estabelecimento", "nome_da_experiencia"] as const) {
        const val = rec[key];
        if (typeof val === "string" && val.trim()) {
          coordMap.set(val.trim(), coords);
          coordMap.set(normKey(val), coords);
        }
      }
    }
  }

  return coordMap;
}

/**
 * Computes straight-line Haversine distance in meters between two points.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/**
 * Calculates distance in meters between two ActivityItems using known coordinates.
 */
export function distanceBetweenItems(
  a: ActivityItem,
  b: ActivityItem,
  coordMap?: Map<string, { latitude: number; longitude: number }>,
): number {
  const cA = extractCoords(a, coordMap);
  const cB = extractCoords(b, coordMap);
  if (
    typeof cA.latitude === "number" &&
    typeof cA.longitude === "number" &&
    typeof cB.latitude === "number" &&
    typeof cB.longitude === "number"
  ) {
    return haversineDistanceMeters(cA.latitude, cA.longitude, cB.latitude, cB.longitude);
  }
  return 5000;
}

/**
 * Generates all permutations of an array.
 */
function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const perms = getPermutations(remaining);
    for (const p of perms) {
      result.push([current, ...p]);
    }
  }
  return result;
}

/**
 * Finds the permutation of a flexible segment that minimizes distance between anchors.
 */
function findBestPermutation(
  segment: ActivityItem[],
  prevItem: ActivityItem | null,
  nextItem: ActivityItem | null,
  coordMap?: Map<string, { latitude: number; longitude: number }>,
): ActivityItem[] {
  if (segment.length <= 1) return segment;

  if (segment.length > 7) {
    const remaining = [...segment];
    const result: ActivityItem[] = [];
    let current = prevItem;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = current ? distanceBetweenItems(current, remaining[i], coordMap) : 0;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const [picked] = remaining.splice(bestIdx, 1);
      result.push(picked);
      current = picked;
    }
    return result;
  }

  const perms = getPermutations(segment);
  let bestPerm = segment;
  let minCost = Infinity;

  for (const perm of perms) {
    let cost = 0;
    if (prevItem) {
      cost += distanceBetweenItems(prevItem, perm[0], coordMap);
    }
    for (let i = 0; i < perm.length - 1; i++) {
      cost += distanceBetweenItems(perm[i], perm[i + 1], coordMap);
    }
    if (nextItem) {
      cost += distanceBetweenItems(perm[perm.length - 1], nextItem, coordMap);
    }

    if (cost < minCost) {
      minCost = cost;
      bestPerm = perm;
    }
  }

  return bestPerm;
}

function parseStartMinutes(timeStr?: string): number {
  if (!timeStr) return 9 * 60 + 30;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return Number(m[1]) * 60 + Number(m[2]);
  }
  return 9 * 60 + 30;
}

function parseItemDurationMinutes(item: ActivityItem): number {
  if (item.duration) {
    const d = durationMinutes(item.duration);
    if (d && d > 0) return d;
  }
  const m = item.time?.match(/^(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (end > start) return end - start;
  }
  return item.category === "restaurant" ? 90 : 75;
}

/**
 * Re-aligns time slots sequentially based on activity durations and travel intervals.
 */
export function realignTimeSlots(
  items: ActivityItem[],
  coordMap?: Map<string, { latitude: number; longitude: number }>,
): ActivityItem[] {
  if (!items.length) return items;
  let cursor = parseStartMinutes(items[0].time);
  const updated: ActivityItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const duration = parseItemDurationMinutes(item);
    const isScheduled = item.time && !item.time.toLowerCase().includes("por agendar");
    let newTime = item.time;

    if (isScheduled || i === 0) {
      const start = cursor;
      const end = cursor + duration;
      newTime = `${clockTime(start)}–${clockTime(end)} (proposto)`;
      cursor = end;
    }

    if (i < items.length - 1) {
      const next = items[i + 1];
      const leg = item.transitToNext;
      let travelMins = 15;
      let buffer = 10;
      if (leg?.duration) {
        travelMins = parseInt(leg.duration, 10) || 15;
        buffer =
          typeof leg.bufferMinutes === "number"
            ? leg.bufferMinutes
            : leg.mode === "walk"
              ? 5
              : 10;
      } else {
        const distM = distanceBetweenItems(item, next, coordMap);
        travelMins = Math.max(5, Math.ceil((distM / 1000 / 30) * 60));
        buffer = distM <= 1000 ? 5 : 10;
      }
      cursor += travelMins + buffer;
    }

    updated.push({
      ...item,
      time: newTime,
    });
  }

  return updated;
}

/**
 * Helper to get all combinations of k items from an array.
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0 || k > arr.length) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = getCombinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

/**
 * Optimizes the sequence of activities for a day to minimize total travel distance,
 * respecting locked items, confirmed activities, and anchoring meals.
 */
export function optimizeRouteSequence(
  items: ActivityItem[],
  coordMap?: Map<string, { latitude: number; longitude: number }>,
): ActivityItem[] {
  if (items.length <= 2) return items;

  const hasFreeTime = items.some((it) => it.category === "free_time");
  if (hasFreeTime) {
    const morningFree = items.filter((it, idx) => it.category === "free_time" && idx === 0);
    const afternoonFree = items.filter((it, idx) => it.category === "free_time" && idx > 0);
    const active = items.filter((it) => it.category !== "free_time");
    if (active.length <= 2) return items;
    const optActive = optimizeRouteSequence(active, coordMap);
    return [...morningFree, ...optActive, ...afternoonFree];
  }

  const isLockedOrConfirmed = (item: ActivityItem) =>
    item.isLocked || item.confirmation?.status === "confirmed";

  const restaurantCount = items.filter((it) => it.category === "restaurant").length;
  const restaurantIndex = items.findIndex((it) => it.category === "restaurant");

  // Partitioned TSP: when there is exactly one lunch anchor and <= 8 items
  if (restaurantCount === 1 && items.length <= 8) {
    const restaurant = items[restaurantIndex];
    const morningTargetCount = restaurantIndex;
    const nonRestaurants = items.filter((it) => it !== restaurant);

    const lockedMorning = items.slice(0, restaurantIndex).filter(isLockedOrConfirmed);
    const lockedAfternoon = items.slice(restaurantIndex + 1).filter(isLockedOrConfirmed);

    const morningCombinations = getCombinations(nonRestaurants, morningTargetCount);
    let bestRoute: ActivityItem[] = items;
    let minCost = Infinity;

    for (const morningItems of morningCombinations) {
      if (!lockedMorning.every((l) => morningItems.includes(l))) continue;
      const afternoonItems = nonRestaurants.filter((it) => !morningItems.includes(it));
      if (!lockedAfternoon.every((l) => afternoonItems.includes(l))) continue;

      const bestM = findBestPermutation(morningItems, null, restaurant, coordMap);
      const bestA = findBestPermutation(afternoonItems, restaurant, null, coordMap);

      let cost = 0;
      for (let i = 0; i < bestM.length - 1; i++) {
        cost += distanceBetweenItems(bestM[i], bestM[i + 1], coordMap);
      }
      if (bestM.length > 0) {
        cost += distanceBetweenItems(bestM[bestM.length - 1], restaurant, coordMap);
      }
      if (bestA.length > 0) {
        cost += distanceBetweenItems(restaurant, bestA[0], coordMap);
      }
      for (let i = 0; i < bestA.length - 1; i++) {
        cost += distanceBetweenItems(bestA[i], bestA[i + 1], coordMap);
      }

      if (cost < minCost) {
        minCost = cost;
        bestRoute = [...bestM, restaurant, ...bestA];
      }
    }

    return realignTimeSlots(bestRoute, coordMap);
  }

  // Segment-based anchor optimization for other cases
  const isAnchor = (item: ActivityItem) =>
    isLockedOrConfirmed(item) || item.category === "restaurant";

  const flexibleCount = items.filter((it) => !isAnchor(it)).length;
  if (flexibleCount <= 1) return items;

  const result: ActivityItem[] = [];
  let currentSegment: ActivityItem[] = [];
  let lastAnchor: ActivityItem | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (isAnchor(item)) {
      if (currentSegment.length > 0) {
        const optimized = findBestPermutation(currentSegment, lastAnchor, item, coordMap);
        result.push(...optimized);
        currentSegment = [];
      }
      result.push(item);
      lastAnchor = item;
    } else {
      currentSegment.push(item);
    }
  }

  if (currentSegment.length > 0) {
    const optimized = findBestPermutation(currentSegment, lastAnchor, null, coordMap);
    result.push(...optimized);
  }

  return realignTimeSlots(result, coordMap);
}

/**
 * Enriches an itinerary with measured road routing legs (TransitLeg) and daily summaries.
 */
export async function enrichItineraryWithRoadRouting(
  days: ItineraryDay[],
  catalogRecords?: Array<Record<string, unknown>>,
  options?: { optimizeSequence?: boolean },
): Promise<ItineraryDay[]> {
  const coordMap = buildCoordMap(catalogRecords);
  const enrichedDays: ItineraryDay[] = [];

  for (const day of days) {
    let items = [...day.items];
    if (options?.optimizeSequence && items.length > 2) {
      items = optimizeRouteSequence(items, coordMap);
    }

    const legs: TransitLeg[] = [];
    let totalMinutes = 0;
    let totalKm = 0;
    let walkingMeters = 0;

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (current.category === "free_time" || next.category === "free_time") {
        continue;
      }

      const fromCoords = extractCoords(current, coordMap);
      const toCoords = extractCoords(next, coordMap);

      const preferredMode = current.transitToNext?.mode;
      const customBuffer = current.transitToNext?.bufferMinutes;

      const leg = await calculateRoadLeg(fromCoords, toCoords, {
        preferredMode,
        bufferMinutes: customBuffer,
      });
      if (leg) {
        items[i] = { ...current, transitToNext: leg };
        legs.push(leg);

        const durNum = parseInt(leg.duration, 10) || 0;
        totalMinutes += durNum;

        const distMatch = leg.distance?.match(/^([\d.]+)\s*(km|m)/i);
        if (distMatch) {
          const val = parseFloat(distMatch[1]);
          const unit = distMatch[2].toLowerCase();
          const meters = unit === "km" ? val * 1000 : val;
          totalKm += meters / 1000;
          if (leg.mode === "walk") walkingMeters += meters;
        }
      }
    }

    let routeSummary: DailyRouteSummary | undefined = undefined;
    if (legs.length > 0) {
      const walkStr =
        walkingMeters >= 1000 ? `${(walkingMeters / 1000).toFixed(1)} km` : `${walkingMeters} m`;
      routeSummary = {
        totalTransitTime: `${totalMinutes} min`,
        totalDistance: `${totalKm.toFixed(1)} km`,
        legsCount: legs.length,
        walkingDistance: walkStr,
        routePath: [items[0].title, ...legs.map((l) => l.toLocation)],
        algorithmStatus: "Viável e Otimizado",
      };
    }

    enrichedDays.push({
      ...day,
      items,
      routeSummary,
    });
  }

  return enrichedDays;
}

/**
 * Recomputes route summary statistics for a list of activity items.
 */
export function recomputeDailyRouteSummary(items: ActivityItem[]): DailyRouteSummary | undefined {
  const legs = items.map((i) => i.transitToNext).filter((l): l is TransitLeg => Boolean(l));
  if (!legs.length) return undefined;

  let totalMinutes = 0;
  let totalKm = 0;
  let walkingMeters = 0;

  for (const leg of legs) {
    const durNum = parseInt(leg.duration, 10) || 0;
    totalMinutes += durNum;

    const distMatch = leg.distance?.match(/^([\d.]+)\s*(km|m)/i);
    if (distMatch) {
      const val = parseFloat(distMatch[1]);
      const unit = distMatch[2].toLowerCase();
      const meters = unit === "km" ? val * 1000 : val;
      totalKm += meters / 1000;
      if (leg.mode === "walk") walkingMeters += meters;
    }
  }

  const walkStr =
    walkingMeters >= 1000 ? `${(walkingMeters / 1000).toFixed(1)} km` : `${walkingMeters} m`;

  return {
    totalTransitTime: `${totalMinutes} min`,
    totalDistance: `${totalKm.toFixed(1)} km`,
    legsCount: legs.length,
    walkingDistance: walkStr,
    routePath: [items[0].title, ...legs.map((l) => l.toLocation)],
    algorithmStatus: "Viável e Otimizado",
  };
}

/**
 * Updates a single transit leg's mode (e.g. walk vs chauffeur) and buffer,
 * recalculates road distance and duration via OSRM, realigns subsequent timestamps,
 * and updates the day's route summary.
 */
export async function updateDayTransitLeg(
  day: ItineraryDay,
  activityId: string,
  newMode: TransitMode,
  customBufferMinutes?: number,
  catalogRecords?: Array<Record<string, unknown>>,
): Promise<ItineraryDay> {
  const coordMap = buildCoordMap(catalogRecords);
  const items = [...day.items];
  const idx = items.findIndex((it) => it.id === activityId);
  if (idx < 0 || idx >= items.length - 1) return day;

  const current = items[idx];
  const next = items[idx + 1];
  const fromCoords = extractCoords(current, coordMap);
  const toCoords = extractCoords(next, coordMap);

  const updatedLeg = await calculateRoadLeg(fromCoords, toCoords, {
    preferredMode: newMode,
    bufferMinutes: customBufferMinutes,
  });

  if (updatedLeg) {
    items[idx] = { ...current, transitToNext: updatedLeg };
  }

  const realignedItems = realignTimeSlots(items, coordMap);
  const summary = recomputeDailyRouteSummary(realignedItems);

  return {
    ...day,
    items: realignedItems,
    routeSummary: summary ?? day.routeSummary,
  };
}

/**
 * Optimizes the route order of a single day and recomputes road travel legs.
 */
export async function optimizeDayRouteOrder(
  day: ItineraryDay,
  catalogRecords?: Array<Record<string, unknown>>,
): Promise<ItineraryDay> {
  const [enriched] = await enrichItineraryWithRoadRouting([day], catalogRecords, {
    optimizeSequence: true,
  });
  return enriched;
}
