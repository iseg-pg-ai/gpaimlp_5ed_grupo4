from __future__ import annotations

import argparse
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
from zoneinfo import ZoneInfo
import pandas as pd
from dotenv import load_dotenv

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from scripts.distancias import (
        Location,
        TravelTimeResult,
        best_duration,
        format_seconds,
        get_driving_time_google_distance_matrix,
    )
except ImportError:
    from distancias import (
        Location,
        TravelTimeResult,
        best_duration,
        format_seconds,
        get_driving_time_google_distance_matrix,
    )

load_dotenv()


@dataclass
class PointOfInterest:
    id: str
    name: str
    category: str
    city: str
    zone: str
    source_sheet: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    raw_address: Optional[str] = None

    @property
    def coordinates(self) -> Optional[Tuple[float, float]]:
        if self.latitude is not None and self.longitude is not None:
            return (round(self.latitude, 6), round(self.longitude, 6))
        return None

    @property
    def formatted_address(self) -> str:
        """Returns the best address string for Google Maps search."""
        if self.raw_address and "por confirmar" not in self.raw_address.lower():
            addr = self.raw_address.strip()
            if not addr.lower().endswith("portugal"):
                if self.city.lower() not in addr.lower():
                    addr = f"{addr}, {self.city}"
                addr = f"{addr}, Portugal"
            return addr

        parts = [self.name]
        if self.zone and str(self.zone).strip() and str(self.zone).strip().lower() != "nan":
            parts.append(str(self.zone).strip())
        if self.city and str(self.city).strip() and str(self.city).strip().lower() != "nan":
            parts.append(str(self.city).strip())
        parts.append("Portugal")
        return ", ".join(parts)

    @property
    def best_location(self) -> Location:
        """Returns coordinates (lat, lng) if available, otherwise formatted address string."""
        coords = self.coordinates
        if coords is not None:
            return coords
        return self.formatted_address

    def to_dict(self) -> dict:
        d = asdict(self)
        d["best_location"] = self.best_location
        d["has_coordinates"] = self.coordinates is not None
        return d


def load_all_points(excel_path: Union[str, Path]) -> Dict[str, PointOfInterest]:
    """Loads and standardizes attractions, restaurants, and experiences from the Excel workbook."""
    excel_path = Path(excel_path)
    if not excel_path.exists():
        for candidate in [
            Path("data") / excel_path.name,
            Path("data/raw") / excel_path.name,
            PROJECT_ROOT / "data" / excel_path.name,
            PROJECT_ROOT / "data/raw" / excel_path.name,
        ]:
            if candidate.exists():
                excel_path = candidate
                break

    if not excel_path.exists():
        raise FileNotFoundError(f"Excel file not found at: {excel_path}")

    points: Dict[str, PointOfInterest] = {}
    xl = pd.ExcelFile(excel_path)
    sheet_names = xl.sheet_names

    # 1. Atrações (ATRACOES or Folha2)
    atr_sheet = next((s for s in ["ATRACOES", "Folha2", "Atrações"] if s in sheet_names), None)
    if atr_sheet:
        try:
            df_atr = pd.read_excel(excel_path, sheet_name=atr_sheet, header=5)
            df_atr = df_atr.dropna(subset=["ID"])
            for _, row in df_atr.iterrows():
                poi_id = str(row["ID"]).strip()
                name = str(row.get("Nome da atração", "")).strip()
                city = str(row.get("Cidade", "Lisboa")).strip()
                zone = str(row.get("Zona/Bairro", "")).strip()
                cat = str(row.get("Categoria", "Atração")).strip()

                lat = row.get("Latitude")
                lng = row.get("Longitude")
                valid_lat = float(lat) if pd.notna(lat) else None
                valid_lng = float(lng) if pd.notna(lng) else None

                points[poi_id] = PointOfInterest(
                    id=poi_id,
                    name=name,
                    category=cat,
                    city=city,
                    zone=zone,
                    source_sheet=f"{atr_sheet} (Atrações)",
                    latitude=valid_lat,
                    longitude=valid_lng,
                    raw_address=None,
                )
        except Exception as e:
            print(f"Warning loading {atr_sheet}: {e}")

    # 2. Restaurantes (RESTAURANTES or Folha3)
    rest_sheet = next((s for s in ["RESTAURANTES", "Folha3", "Restaurantes"] if s in sheet_names), None)
    if rest_sheet:
        try:
            df_rest = pd.read_excel(excel_path, sheet_name=rest_sheet)
            df_rest = df_rest.dropna(subset=["ID BLU"])
            for _, row in df_rest.iterrows():
                poi_id = str(row["ID BLU"]).strip()
                name = str(row.get("Estabelecimento", "")).strip()
                city = str(row.get("Cidade", "Lisboa")).strip()
                zone = str(row.get("Zona / localidade", "")).strip()
                raw_addr = str(row.get("Morada", "")).strip()
                cat = str(row.get("Tipo / gastronomia (base)", "Restaurante")).strip()

                lat = row.get("Latitude")
                lng = row.get("Longitude")
                valid_lat = None
                valid_lng = None
                if pd.notna(lat) and pd.notna(lng):
                    f_lat = float(lat)
                    f_lng = float(lng)
                    if abs(f_lat) > 90:
                        f_lat /= 1e6
                    if abs(f_lng) > 180:
                        f_lng /= 1e6
                    valid_lat = f_lat
                    valid_lng = f_lng

                points[poi_id] = PointOfInterest(
                    id=poi_id,
                    name=name,
                    category=cat,
                    city=city,
                    zone=zone,
                    source_sheet=f"{rest_sheet} (Restaurantes)",
                    latitude=valid_lat,
                    longitude=valid_lng,
                    raw_address=raw_addr,
                )
        except Exception as e:
            print(f"Warning loading {rest_sheet}: {e}")

    # 3. Experiências (EXPERIENCIAS or Folha4)
    exp_sheet = next((s for s in ["EXPERIENCIAS", "Folha4", "Experiências"] if s in sheet_names), None)
    if exp_sheet:
        try:
            df_exp = pd.read_excel(excel_path, sheet_name=exp_sheet)
            df_exp = df_exp.dropna(subset=["Nome da experiência"])
            for idx, row in df_exp.iterrows():
                poi_id = f"EXP-{idx + 1:03d}"
                name = str(row["Nome da experiência"]).strip()
                loc_str = str(row.get("Localização", "")).strip()
                cat = str(row.get("Categoria", "Experiência")).strip()

                points[poi_id] = PointOfInterest(
                    id=poi_id,
                    name=name,
                    category=cat,
                    city="Lisboa",
                    zone=loc_str,
                    source_sheet=f"{exp_sheet} (Experiências)",
                    latitude=None,
                    longitude=None,
                    raw_address=f"{name}, {loc_str}, Portugal" if loc_str else None,
                )
        except Exception as e:
            print(f"Warning loading {exp_sheet}: {e}")

    return points


def export_points_to_csv(
    points: Dict[str, PointOfInterest],
    output_csv: Union[str, Path] = "data/processed/pontos_interesse.csv",
) -> Path:
    """Exports all parsed points of interest to a clean CSV."""
    out_path = Path(output_csv)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([p.to_dict() for p in points.values()])
    df.to_csv(out_path, index=False, encoding="utf-8")
    print(f"Saved {len(df)} points to {out_path}")
    return out_path


def calculate_distance_between_pois(
    origin_poi: PointOfInterest,
    destination_poi: PointOfInterest,
    departure_time: Union[datetime, str] = "now",
    api_key: Optional[str] = None,
    traffic_model: str = "best_guess",
) -> TravelTimeResult:
    """Computes driving distance & duration between two PointOfInterest entities."""
    return get_driving_time_google_distance_matrix(
        origin=origin_poi.best_location,
        destination=destination_poi.best_location,
        departure_time=departure_time,
        api_key=api_key,
        traffic_model=traffic_model,
    )


def run_demo_routes(points: Dict[str, PointOfInterest], api_key: Optional[str] = None):
    """Demonstrates distance calculations across representative test pairs."""
    test_pairs = [
        (
            "LIS-001",  # Castelo de São Jorge (GPS Coords)
            "REST-002",  # Cervejaria Ramiro (Street Address)
            "Rota 1: Monumento (Coordenadas) -> Restaurante (Morada) [Lisboa Centro]",
        ),
        (
            "REST-004",  # SUD Lisboa Terrazza (Belém)
            "LIS-002",  # Sé de Lisboa (Alfama)
            "Rota 2: Belém -> Alfama [Travessia Urbana Lisboa]",
        ),
        (
            "LIS-001",  # Castelo de São Jorge (Lisboa)
            "SIN-001",  # Palácio Nacional da Pena (Sintra)
            "Rota 3: Lisboa -> Sintra [Excursão Regional Lisboa a Sintra]",
        ),
        (
            "POR-004",  # Torre e Igreja dos Clérigos (Porto)
            "REST-053",  # The Yeatman (Vila Nova de Gaia)
            "Rota 4: Porto -> Vila Nova de Gaia [Rota Norte: Clérigos a The Yeatman]",
        ),
    ]

    print("\n" + "=" * 80)
    print("📍 DEMONSTRAÇÃO DE ROTAS COM DADOS DO FICHEIRO EXCEL")
    print("=" * 80)

    key = api_key or os.getenv("GOOGLE_MAPS_API_KEY")

    for orig_id, dest_id, description in test_pairs:
        orig = points.get(orig_id)
        dest = points.get(dest_id)
        if not orig or not dest:
            print(f"Skipping {orig_id} -> {dest_id} (not found)")
            continue

        print(f"\n📌 {description}")
        print(f"  • Origem:      [{orig.id}] {orig.name} ({orig.city})")
        print(f"    Localização: {orig.best_location}")
        print(f"  • Destino:     [{dest.id}] {dest.name} ({dest.city})")
        print(f"    Localização: {dest.best_location}")

        engine = "Google Maps API" if (key and key != "111111111") else "OSRM (OpenStreetMap)"
        print(f"  ⚡ Motor de Rota: {engine}")

        try:
            result = calculate_distance_between_pois(orig, dest, api_key=key)
            secs = best_duration(result)
            h, m, s = format_seconds(secs)
            dur_str = f"{h}h {m}m {s}s" if h > 0 else f"{m}m {s}s"

            print(f"  ✅ Distância: {result.distance_meters / 1000:.2f} km")
            print(f"  ✅ Tempo:     {dur_str} (Texto: {result.duration_text})")
            if result.duration_in_traffic_text:
                print(f"  ✅ Trânsito:  {result.duration_in_traffic_text}")
            print(f"  🌐 Morada resolvida (Origem):  {result.origin_address}")
            print(f"  🌐 Morada resolvida (Destino): {result.destination_address}")
        except Exception as err:
            print(f"  ❌ Erro na chamada da API: {err}")

    print("\n" + "=" * 80)


def main():
    parser = argparse.ArgumentParser(
        description="Processar pontos e testar Google Distance Matrix API com dados do ISEG"
    )
    parser.add_argument(
        "--excel",
        default="Requisitos informações Alunos ISEG.xlsx",
        help="Caminho para o ficheiro Excel",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Exportar dados limpos para data/processed/pontos_interesse.csv",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Executar rotas de demonstração",
    )
    parser.add_argument(
        "--test",
        nargs=2,
        metavar=("ORIG_ID", "DEST_ID"),
        help="Testar distância entre dois IDs (ex: LIS-001 REST-002)",
    )
    parser.add_argument(
        "--list-city",
        type=str,
        help="Listar pontos de interesse para uma cidade (ex: Lisboa, Porto, Sintra)",
    )
    args = parser.parse_args()

    points = load_all_points(args.excel)
    print(f"Loaded {len(points)} total points of interest:")
    atr_count = sum(1 for p in points.values() if "Atrações" in p.source_sheet)
    rest_count = sum(1 for p in points.values() if "Restaurantes" in p.source_sheet)
    exp_count = sum(1 for p in points.values() if "Experiências" in p.source_sheet)
    coords_count = sum(1 for p in points.values() if p.coordinates is not None)
    print(f"  - {atr_count} Atrações")
    print(f"  - {rest_count} Restaurantes")
    print(f"  - {exp_count} Experiências")
    print(f"  - {coords_count} com coordenadas GPS exatas, {len(points) - coords_count} com morada/query textual")

    if args.export:
        export_points_to_csv(points)

    if args.list_city:
        city_lower = args.list_city.lower()
        matched = [p for p in points.values() if city_lower in p.city.lower()]
        print(f"\nPontos encontrados em '{args.list_city}' ({len(matched)}):")
        for p in matched[:20]:
            print(f"  [{p.id}] {p.name} | {p.category} | {p.best_location}")
        if len(matched) > 20:
            print(f"  ... e mais {len(matched) - 20} pontos.")

    if args.test:
        orig_id, dest_id = args.test
        orig = points.get(orig_id)
        dest = points.get(dest_id)
        if not orig:
            print(f"ID de origem '{orig_id}' não encontrado.")
            return
        if not dest:
            print(f"ID de destino '{dest_id}' não encontrado.")
            return

        print(f"\nCalculando distância:")
        print(f"  Origem:  [{orig.id}] {orig.name} -> {orig.best_location}")
        print(f"  Destino: [{dest.id}] {dest.name} -> {dest.best_location}")
        try:
            res = calculate_distance_between_pois(orig, dest)
            secs = best_duration(res)
            h, m, s = format_seconds(secs)
            print(f"  Distância: {res.distance_meters / 1000:.2f} km")
            print(f"  Duração:   {h}h {m}m {s}s")
            print(f"  Origem resolvida:  {res.origin_address}")
            print(f"  Destino resolvido: {res.destination_address}")
        except Exception as e:
            print(f"  Erro ao consultar API: {e}")

    if args.demo or (not args.export and not args.list_city and not args.test):
        run_demo_routes(points)


if __name__ == "__main__":
    main()
