from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.distancias import get_travel_time_matrix_osrm, format_seconds
from scripts.processar_pontos import load_all_points, PointOfInterest


def build_day_itinerary(
    poi_ids: List[str],
    lunch_poi_id: Optional[str] = None,
    start_time_str: str = "09:30",
    default_visit_minutes: int = 75,
    lunch_minutes: int = 90,
    excel_path: str = "data/Requisitos informações Alunos ISEG.xlsx",
) -> Dict:
    """Builds a time-constrained schedule with real displacement times between places using OSRM."""
    all_points = load_all_points(excel_path)

    # Validate selected POIs
    selected_pois: List[PointOfInterest] = []
    for pid in poi_ids:
        if pid in all_points:
            selected_pois.append(all_points[pid])
        else:
            print(f"Warning: POI {pid} not found in catalog.")

    if lunch_poi_id and lunch_poi_id in all_points:
        lunch_poi = all_points[lunch_poi_id]
    else:
        lunch_poi = None

    # Insert lunch around midday (after 2nd morning activity if available)
    ordered_sequence: List[tuple[PointOfInterest, str, int]] = []
    
    morning_pois = selected_pois[:2]
    afternoon_pois = selected_pois[2:]

    for p in morning_pois:
        ordered_sequence.append((p, "Visita Cultural / Atração", default_visit_minutes))

    if lunch_poi:
        ordered_sequence.append((lunch_poi, "Almoço Gastronómico", lunch_minutes))

    for p in afternoon_pois:
        ordered_sequence.append((p, "Visita Cultural / Atração", default_visit_minutes))

    if len(ordered_sequence) < 2:
        raise ValueError("At least 2 points of interest are required to build an itinerary.")

    # Compute NxN matrix in 1 single OSRM network call
    locations = [p.best_location for p, _, _ in ordered_sequence]
    matrix = get_travel_time_matrix_osrm(locations)
    durations = matrix["durations_seconds"]
    distances = matrix["distances_meters"]

    # Construct the timeline
    base_date = datetime.now().date()
    start_hour, start_min = map(int, start_time_str.split(":"))
    current_time = datetime.combine(base_date, datetime.min.time()).replace(
        hour=start_hour, minute=start_min
    )

    timeline = []
    total_travel_seconds = 0
    total_travel_meters = 0

    for idx, (poi, slot_type, visit_mins) in enumerate(ordered_sequence):
        displacement_info = None

        if idx > 0:
            travel_sec = int(round(durations[idx - 1][idx]))
            travel_m = int(round(distances[idx - 1][idx]))
            total_travel_seconds += travel_sec
            total_travel_meters += travel_m

            prev_poi, _, _ = ordered_sequence[idx - 1]
            th, tm, _ = format_seconds(travel_sec)
            travel_str = f"{th}h {tm}m" if th > 0 else f"{tm} min"

            departure_time = current_time
            current_time += timedelta(seconds=travel_sec)

            displacement_info = {
                "from_poi": prev_poi.name,
                "to_poi": poi.name,
                "departure_time": departure_time.strftime("%H:%M"),
                "arrival_time": current_time.strftime("%H:%M"),
                "duration_seconds": travel_sec,
                "duration_text": travel_str,
                "distance_km": round(travel_m / 1000.0, 2),
            }

        start_visit = current_time
        end_visit = start_visit + timedelta(minutes=visit_mins)
        current_time = end_visit

        timeline.append(
            {
                "step": idx + 1,
                "poi_id": poi.id,
                "name": poi.name,
                "category": poi.category,
                "city": poi.city,
                "slot_type": slot_type,
                "start_time": start_visit.strftime("%H:%M"),
                "end_time": end_visit.strftime("%H:%M"),
                "visit_duration_minutes": visit_mins,
                "displacement_from_previous": displacement_info,
            }
        )

    tot_h, tot_m, _ = format_seconds(total_travel_seconds)
    summary = {
        "start_time": start_time_str,
        "end_time": current_time.strftime("%H:%M"),
        "total_activities": len(timeline),
        "total_travel_duration": f"{tot_h}h {tot_m}m" if tot_h > 0 else f"{tot_m} min",
        "total_travel_distance_km": round(total_travel_meters / 1000.0, 2),
        "timeline": timeline,
    }
    return summary


def print_itinerary(itinerary: Dict):
    print("\n" + "=" * 78)
    print(f"🗓️  ITINERÁRIO DO DIA ({itinerary['start_time']} às {itinerary['end_time']})")
    print(f"🚗 Deslocação Total: {itinerary['total_travel_distance_km']} km | Tempo em Trânsito: {itinerary['total_travel_duration']}")
    print("=" * 78)

    for item in itinerary["timeline"]:
        disp = item["displacement_from_previous"]
        if disp:
            print(f"\n   ⬇️  🚗 Deslocação ({disp['duration_text']} - {disp['distance_km']} km) [{disp['departure_time']} ➔ {disp['arrival_time']}]")
            print(f"       Trajeto: {disp['from_poi']} ➔ {disp['to_poi']}")

        print(f"\n[{item['start_time']} - {item['end_time']}] 📍 {item['name']} ({item['category']})")
        print(f"   • Tipo: {item['slot_type']} | Duração recomendada: {item['visit_duration_minutes']} min")

    print("\n" + "=" * 78)


if __name__ == "__main__":
    # Example: A full day in Lisbon with real attractions and lunch at Cervejaria Ramiro
    sample_pois = [
        "LIS-001",  # Castelo de São Jorge
        "LIS-002",  # Sé de Lisboa
        "LIS-004",  # Mosteiro dos Jerónimos (Belém)
    ]
    lunch_poi = "REST-002"  # Cervejaria Ramiro

    plan = build_day_itinerary(
        poi_ids=sample_pois,
        lunch_poi_id=lunch_poi,
        start_time_str="09:30",
        default_visit_minutes=75,
        lunch_minutes=90,
    )
    print_itinerary(plan)
