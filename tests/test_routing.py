"""Testes do cálculo rodoviário sem pedidos externos."""
import unittest

from portal.routing import (calculate_road_leg, optimize_route_sequence,
                            realign_time_slots, route_summary)


class RoutingTest(unittest.TestCase):
    def test_osrm_result_preserves_modes_distance_and_buffer(self):
        calls = []

        def provider(url, timeout):
            calls.append((url, timeout))
            return {"code": "Ok", "routes": [{"distance": 1250.4, "duration": 180.2}]}

        leg = calculate_road_leg(
            {"title": "Origem", "latitude": 38.7, "longitude": -9.1},
            {"title": "Destino", "latitude": 38.8, "longitude": -9.2},
            {"preferredMode": "train", "bufferMinutes": 12, "timeoutMs": 2500}, provider)
        self.assertEqual((leg["mode"], leg["distance"], leg["duration"]),
                         ("train", "1.3 km", "8 min"))
        self.assertEqual(leg["bufferMinutes"], 12)
        self.assertTrue(leg["isAlgorithmOptimized"])
        self.assertEqual(calls[0][1], 2.5)

    def test_missing_coordinates_do_not_contact_provider(self):
        def forbidden(*_):
            self.fail("Não deve contactar o fornecedor")

        leg = calculate_road_leg({"title": "A"}, {"title": "B"},
                                 {"preferredMode": "walk"}, forbidden)
        self.assertEqual((leg["duration"], leg["distance"]), ("20 min", "Por confirmar"))
        self.assertFalse(leg["isAlgorithmOptimized"])

    def test_provider_failure_uses_geometric_fallback(self):
        def failed(*_):
            raise TimeoutError

        leg = calculate_road_leg(
            {"title": "A", "latitude": 38.7, "longitude": -9.1},
            {"title": "B", "latitude": 38.71, "longitude": -9.11}, {}, failed)
        self.assertRegex(leg["distance"], r"\d+\.\d km \(estimado\)")
        self.assertFalse(leg["isAlgorithmOptimized"])

    def test_invalid_mode_and_boolean_coordinates_are_rejected_or_unknown(self):
        with self.assertRaisesRegex(ValueError, "Modo"):
            calculate_road_leg({"title": "A"}, {"title": "B"},
                               {"preferredMode": "plane"})
        leg = calculate_road_leg({"title": "A", "latitude": True, "longitude": 0},
                                 {"title": "B", "latitude": 0, "longitude": 0})
        self.assertEqual(leg["distance"], "Por confirmar")

    def test_python_optimizes_route_while_preserving_lunch_anchor(self):
        items = [
            {"id": "a", "title": "A", "category": "activity", "latitude": 0, "longitude": 0, "time": "09:00–10:00"},
            {"id": "c", "title": "C", "category": "activity", "latitude": 0, "longitude": 3, "time": "10:00–11:00"},
            {"id": "l", "title": "Almoço", "category": "restaurant", "latitude": 0, "longitude": 2, "time": "12:30–14:00"},
            {"id": "b", "title": "B", "category": "activity", "latitude": 0, "longitude": 1, "time": "14:00–15:00"},
        ]
        optimized = optimize_route_sequence(items)
        self.assertEqual(optimized[2]["id"], "l")
        self.assertEqual({item["id"] for item in optimized}, {"a", "b", "c", "l"})
        self.assertTrue(all("(proposto)" in item["time"] for item in optimized))

    def test_python_realigns_and_summarizes_real_legs(self):
        items = [
            {"id": "a", "title": "A", "category": "activity", "time": "09:00–10:00",
             "transitToNext": {"toLocation": "B", "duration": "12 min", "distance": "800 m", "mode": "walk", "bufferMinutes": 5}},
            {"id": "b", "title": "B", "category": "activity", "time": "10:00–11:00",
             "transitToNext": {"toLocation": "C", "duration": "18 min", "distance": "2.5 km", "mode": "chauffeur", "bufferMinutes": 10}},
            {"id": "c", "title": "C", "category": "activity", "time": "11:00–12:00"},
        ]
        aligned = realign_time_slots(items)
        self.assertEqual(aligned[1]["time"], "10:17–11:17 (proposto)")
        self.assertEqual(route_summary(aligned), {
            "totalTransitTime": "30 min", "totalDistance": "3.3 km", "legsCount": 2,
            "walkingDistance": "800 m", "routePath": ["A", "B", "C"],
            "algorithmStatus": "Viável e Otimizado",
        })


if __name__ == "__main__":
    unittest.main()
