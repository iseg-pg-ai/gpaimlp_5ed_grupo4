import type {
  ActivityItem,
  DailyRouteSummary,
  ItineraryDay,
  TransitLeg,
  TransitMode,
} from "../types/index";

interface LocationCoords {
  latitude?: number | null;
  longitude?: number | null;
  title: string;
}

const OSRM_URL = process.env.OSRM_ROUTER_URL || "http://router.project-osrm.org";

/**
 * Calculates real road distance and travel duration between two coordinates using OSRM.
 * Falls back to Haversine if OSRM is unreachable or coordinates are missing.
 */
export async function calculateRoadLeg(
  from: LocationCoords,
  to: LocationCoords,
  timeoutMs = 3000,
): Promise<TransitLeg | null> {
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
    return {
      id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
      fromLocation: from.title,
      toLocation: to.title,
      mode: "chauffeur",
      duration: "15 min",
      distance: "Por confirmar",
      routeNote: "Coordenadas incompletas; estimativa padrão de deslocação",
      bufferMinutes: 15,
      isAlgorithmOptimized: false,
      algorithmNote: "Sem coordenadas precisas no catálogo; tempo de reserva atribuído.",
    };
  }

  const lat1 = from.latitude!;
  const lon1 = from.longitude!;
  const lat2 = to.latitude!;
  const lon2 = to.longitude!;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${OSRM_URL}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const meters = Math.round(route.distance);
        const seconds = Math.round(route.duration);
        const minutes = Math.max(1, Math.round(seconds / 60));
        const km = meters / 1000;

        // Choose mode: walk for <= 1 km; chauffeur otherwise
        const mode: TransitMode = meters <= 1000 ? "walk" : "chauffeur";
        const distStr = meters < 1000 ? `${meters} m` : `${km.toFixed(1)} km`;
        const durStr = `${minutes} min`;

        return {
          id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
          fromLocation: from.title,
          toLocation: to.title,
          mode,
          duration: durStr,
          distance: distStr,
          routeNote:
            mode === "walk"
              ? `Percurso pedonal de ${distStr} (~${durStr})`
              : `Trajeto de ${distStr} via estrada (~${durStr})`,
          bufferMinutes: mode === "walk" ? 5 : 10,
          isAlgorithmOptimized: true,
          algorithmNote:
            "Percurso rodoviário medido pela malha viária real via OSRM (OpenStreetMap).",
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
  const estMins = Math.max(10, Math.ceil(((straightKm * 1.5) / 25) * 60 + 10));

  return {
    id: `transit-${encodeURIComponent(from.title)}-${encodeURIComponent(to.title)}`,
    fromLocation: from.title,
    toLocation: to.title,
    mode: straightKm <= 0.8 ? "walk" : "chauffeur",
    duration: `${estMins} min`,
    distance: `${straightKm.toFixed(1)} km (estimado)`,
    routeNote: `Margem estimada: ~${estMins} min (${straightKm.toFixed(1)} km em linha reta)`,
    bufferMinutes: 10,
    isAlgorithmOptimized: false,
    algorithmNote: "Estimativa geométrica (fator urbano 1,5 a 25 km/h + 10 min de tolerância).",
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
 * Enriches an itinerary with measured road routing legs (TransitLeg) and daily summaries.
 */
export async function enrichItineraryWithRoadRouting(
  days: ItineraryDay[],
  catalogRecords?: Array<Record<string, unknown>>,
): Promise<ItineraryDay[]> {
  // Build lookup map for coordinates
  const coordMap = new Map<string, { latitude: number; longitude: number }>();
  if (catalogRecords) {
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
  }

  const enrichedDays: ItineraryDay[] = [];

  for (const day of days) {
    const items = [...day.items];
    const legs: TransitLeg[] = [];
    let totalMinutes = 0;
    let totalKm = 0;
    let walkingMeters = 0;

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      const fromCoords = extractCoords(current, coordMap);
      const toCoords = extractCoords(next, coordMap);

      const leg = await calculateRoadLeg(fromCoords, toCoords);
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
        algorithmStatus: "Feasible & Optimized",
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
