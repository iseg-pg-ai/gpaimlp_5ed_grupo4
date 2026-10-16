"""Contratos de exploração; requerem o grupo opcional dashboard."""
from __future__ import annotations

import importlib.util
import json
import unittest
from unittest.mock import patch

AVAILABLE = all(importlib.util.find_spec(name) is not None for name in ("pandas", "plotly", "streamlit"))
if AVAILABLE:
    import pandas as pd
    from dashboard import app


@unittest.skipUnless(AVAILABLE, "Grupo opcional dashboard não instalado")
class DashboardContractsTest(unittest.TestCase):
    def points(self):
        return pd.DataFrame([
            {"Chave": "Atração:A1", "Tipo": "Atração", "Nome": "Primeira", "Localização": "Lisboa", "latitude": 38.71, "longitude": -9.11, "norte": 42.0},
            {"Chave": "Atração:A2", "Tipo": "Atração", "Nome": "Segunda", "Localização": "Lisboa", "latitude": 38.72, "longitude": -9.12, "norte": 42.01},
            {"Chave": "Restaurante:A1", "Tipo": "Restaurante", "Nome": "Mesa", "Localização": "Lisboa", "latitude": 38.71, "longitude": -9.11, "norte": 42.0},
        ], index=[8, 22, 71])

    def test_grouping_preserves_all_members_and_entity_types(self):
        grouped = app.map_points(self.points(), True)
        members = [json.loads(value) for value in grouped.Membros]
        self.assertIn(["Atração:A1", "Atração:A2"], members)
        self.assertIn(["Restaurante:A1"], members)
        self.assertEqual(grouped.Quantidade.sum(), 3)

    def test_individual_clicks_use_stable_keys_instead_of_frame_indices(self):
        points = app.map_points(self.points().iloc[[1, 2]], False)
        self.assertEqual(points.Membros.map(json.loads).tolist(), [["Atração:A2"], ["Restaurante:A1"]])

    def test_map_excludes_unknown_and_invalid_coordinates(self):
        frame = self.points()
        frame.loc[22, "latitude"] = None
        frame.loc[71, "longitude"] = 181
        self.assertEqual(app.located(frame).Chave.tolist(), ["Atração:A1"])

    def test_unknown_price_is_not_zero(self):
        self.assertEqual(app.display_value(None), "Por confirmar")
        self.assertEqual(app.display_value("  "), "Por confirmar")
        self.assertEqual(app.display_value(0), "0")

    def test_history_uses_explicit_parameterized_identifier(self):
        row = pd.Series({"Tipo": "Atração", "Identificador": "A'1"})
        with patch.object(app, "query", return_value=pd.DataFrame()) as read:
            app.historical_mentions(row)
        sql, params = read.call_args.args
        self.assertIn("id_atracao_base = ?", sql)
        self.assertEqual(params, ("A'1",))
        self.assertNotIn("A'1", sql)

    def test_history_does_not_guess_restaurant_or_experience_matches(self):
        with patch.object(app, "query") as read:
            for kind in ("Restaurante", "Experiência"):
                self.assertTrue(app.historical_mentions(pd.Series({"Tipo": kind, "Identificador": "A1"})).empty)
        read.assert_not_called()

    def test_review_prioritizes_pending_conditions_without_marking_zero_missing(self):
        frame = pd.DataFrame([{"Chave": "Atração:A1", "Nome": "Primeira", "Tipo": "Atração",
                               "Duração": "1 hora", "Horário": "A confirmar", "Preço": 0,
                               "Condições": "Por confirmar", "Acessibilidade": "Consultar fonte", "Fonte": "https://example.org"}])
        pending = app.review_items(frame)
        self.assertEqual(set(pending.Campo), {"Horário", "Condições"})
        self.assertEqual(pending.loc[pending.Campo == "Condições", "Prioridade"].iloc[0], "1 · Condições comerciais")


if __name__ == "__main__":
    unittest.main()
