"""Testes do cálculo rodoviário sem pedidos externos."""
import unittest

from portal.routing import calculate_road_leg


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


if __name__ == "__main__":
    unittest.main()
