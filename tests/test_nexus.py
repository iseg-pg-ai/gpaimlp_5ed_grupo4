"""NEXUS Integration Gateway v0.1: modelo canónico, adaptador GetYourGuide, ingestão de fornecedores,
análise de margem e canibalização e o endpoint. Dados sintéticos em pastas temporárias."""
from datetime import date
from decimal import Decimal
import io
import json
from pathlib import Path
import tempfile
import unittest

from nexus.adapters.getyourguide import price_breakdown_to_offers, tours_to_offers
from nexus.gateway import create_app
from nexus.ingest import COLUMNS, ingest_supplier_file
from nexus.margins import analyse
from nexus.model import FIELDS, LINEAGE_FIELDS, ValidationError, checksum, validate_offer

ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-10-30T08:00:00+00:00"


def lineage(source_id="s1", ref="f.csv#row=2", source_type="file"):
    return {"source_id": source_id, "source_type": source_type, "ref": ref, "contract": "test@1", "ingested_at": NOW, "checksum": checksum(ref)}


def offer(**extra):
    base = {"offer_id": "s1:a", "product_key": "sintra-day", "title": "Sintra", "channel": "direct", "source_id": "s1",
            "currency": "EUR", "unit": "person", "price_basis": "quoted", "sell_price": "55", "cost_price": "30", "lineage": lineage()}
    return validate_offer({**base, **extra})


class ModelTest(unittest.TestCase):
    def test_schema_and_model_describe_the_same_record(self):
        schema = json.loads((ROOT / "src/nexus/schemas/offer.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(set(schema["properties"]), set(FIELDS))
        self.assertEqual(set(schema["required"]), {name for name, required in FIELDS.items() if required})
        self.assertEqual(set(schema["properties"]["lineage"]["required"]), set(LINEAGE_FIELDS))

    def test_strict_validation_refuses_instead_of_guessing(self):
        cases = {
            "campos desconhecidos": {"margin": "1"},
            "ponto decimal": {"sell_price": "90,5"},
            "ISO 4217": {"currency": "eur"},
            "a revenda não tem custo": {"channel": "reseller", "cost_price": "10"},
            "só se aplica à revenda": {"commission_rate": "0.1"},
            "anterior a valid_from": {"valid_from": "2026-11-02", "valid_to": "2026-11-01"},
            "min_pax": {"min_pax": "0"},
        }
        for message, extra in cases.items():
            with self.subTest(message), self.assertRaises(ValidationError) as caught:
                offer(**extra)
            self.assertIn(message, str(caught.exception))

    def test_unknown_cost_stays_unknown_not_zero(self):
        self.assertIsNone(offer(cost_price="").get("cost_price"))
        self.assertEqual(offer(sell_price=90.5)["sell_price"], Decimal("90.5"))


class GetYourGuideAdapterTest(unittest.TestCase):
    SOURCE = {"id": "gyg", "commission_rate": "0.1"}

    def test_tours_need_an_explicit_mapping_and_take_the_currency_from_the_request(self):
        payload = {"_metadata": {"query": "cnt_language=en&currency=eur"}, "data": {"tours": [
            {"tour_id": 101, "title": "Sintra day trip", "supplier_id": 9, "price": {"values": {"amount": 50}, "description": "per person"}},
            {"tour_id": 202, "title": "Private group", "price": {"values": {"amount": 300}, "description": "per group"}},
            {"tour_id": 303, "title": "Unmapped tour", "price": {"values": {"amount": 20}}},
        ]}}
        offers, rejected, unmatched = tours_to_offers(payload, source=self.SOURCE, mapping={"101": "sintra-day", "202": "sintra-private"}, ingested_at=NOW)
        self.assertEqual(rejected, [])
        self.assertEqual([(o["offer_id"], o["currency"], o["unit"], o["price_basis"], o["channel"]) for o in offers],
                         [("gyg:101", "EUR", "person", "from", "reseller"), ("gyg:202", "EUR", "group", "from", "reseller")])
        self.assertEqual([item["tour_id"] for item in unmatched], [303])
        self.assertEqual(offers[0]["lineage"]["contract"], "getyourguide/partner-api-spec@1.0.0")
        self.assertEqual(offers[0]["lineage"]["ref"], "GET /1/tours#data.tours[0]")
        # Sem moeda no pedido, a tour é recusada em vez de assumir uma.
        offers, rejected, _ = tours_to_offers({"data": payload["data"]}, source=self.SOURCE, mapping={"101": "sintra-day"}, ingested_at=NOW)
        self.assertEqual(offers, [])
        self.assertTrue(any("currency" in error for item in rejected for error in item["errors"]))

    def test_price_breakdown_gives_a_quoted_price_per_person_for_the_day(self):
        payload = {"tour_options": [{"option_id": 7, "time_slots": [
            {"date_time": "2026-11-05T09:00:00", "vacancies": 10, "min_participants": 2,
             "price_breakdown": {"individuals": [{"category_id": 1, "ticket_category": "adult", "quantity": 2, "price": {"retail_price": 96.0, "customer_base_price": 110.0, "currency": "EUR"}}],
                                 "price_summary": {"retail_price": 96.0, "currency": "EUR"}}},
            {"date_time": "2026-11-06T09:00:00", "vacancies": 0, "price_breakdown": {"individuals": [], "price_summary": {"retail_price": 0, "currency": "EUR"}}},
        ]}]}
        offers, rejected, _ = price_breakdown_to_offers(payload, tour_id=101, title="Sintra day trip", source=self.SOURCE, mapping={"101": "sintra-day"}, ingested_at=NOW)
        self.assertEqual([(o["offer_id"], str(o["sell_price"]), o["price_basis"], o["min_pax"], o["valid_from"]) for o in offers],
                         [("gyg:101:7:2026-11-05", "48.00", "quoted", 2, date(2026, 11, 5))])
        self.assertEqual(len(rejected), 1)


class SupplierIngestTest(unittest.TestCase):
    def write(self, folder, name, text):
        path = Path(folder) / name
        path.write_text(text, encoding="utf-8")
        return path

    def test_each_row_is_validated_alone_with_its_lineage(self):
        header = ";".join(COLUMNS)
        rows = [
            "hotel-1;Quinta;sintra-day;Sintra privado;direct;EUR;person;55;30;;2026-11-01;2026-12-31",
            "hotel-1;Quinta;sintra-day;Sintra privado;direct;EUR;person;55,5;30;;2026-11-01;2026-12-31",
            "hotel-1;Quinta;sintra-day;Sintra privado;direct;EUR;person;55;30;;2026-11-01;2026-12-31",
            "hotel-1;Quinta;lisbon-tuk;Tuk-tuk;reseller;EUR;person;20;;;;",
            "hotel-1;Quinta;lisbon-tuk;Tuk-tuk;own;EUR;group;80;;;;",
        ]
        with tempfile.TemporaryDirectory() as folder:
            path = self.write(folder, "precos.csv", "\n".join([header, *rows]) + "\n")
            offers, rejected = ingest_supplier_file(path, source_id="supplier-sintra", ingested_at=NOW)
        self.assertEqual([o["product_key"] for o in offers], ["sintra-day", "lisbon-tuk"])
        self.assertIsNone(offers[1]["cost_price"])
        self.assertEqual(offers[0]["lineage"]["ref"], "precos.csv#row=2")
        self.assertEqual(len(offers[0]["lineage"]["checksum"]), 64)
        self.assertEqual([item["ref"] for item in rejected], ["precos.csv#row=3", "precos.csv#row=4", "precos.csv#row=5"])
        self.assertIn("ponto decimal", rejected[0]["errors"][0])
        self.assertIn("repetida", rejected[1]["errors"][0])
        self.assertIn("revenda", rejected[2]["errors"][0])

    def test_missing_or_extra_columns_refuse_the_row(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.write(folder, "lista.json", json.dumps([{"product_key": "x", "discount": "5"}]))
            offers, rejected = ingest_supplier_file(path, source_id="supplier-x", ingested_at=NOW)
        self.assertEqual(offers, [])
        self.assertTrue(any("em falta" in error for error in rejected[0]["errors"]))
        self.assertTrue(any("desconhecidas ['discount']" in error for error in rejected[0]["errors"]))


class MarginTest(unittest.TestCase):
    def offers(self, commission="0.1"):
        return [
            offer(offer_id="own:a", channel="own", source_id="own", sell_price="60", cost_price="40", lineage=lineage("own")),
            offer(offer_id="direct:a", sell_price="55", cost_price="30", source_id="direct", lineage=lineage("direct")),
            offer(offer_id="gyg:101", channel="reseller", source_id="gyg", sell_price="50", cost_price=None, commission_rate=commission, price_basis="quoted", lineage=lineage("gyg", "GET /1/tours", "api")),
        ]

    def test_profit_picks_the_best_channel_and_prices_the_cannibalization(self):
        report = analyse(self.offers(), objective="profit", pax=2, as_of=date(2026, 11, 5))
        product = report["products"][0]
        self.assertEqual(product["best"]["offer_id"], "direct:a")
        self.assertEqual(product["best"]["profit"], "50.00")
        losses = {item["offer_id"]: item["loss_per_sale"] for item in product["cannibalization"]}
        self.assertEqual(losses, {"own:a": "10.00", "gyg:101": "40.00"})
        gyg = next(row for row in product["alternatives"] if row["offer_id"] == "gyg:101")
        self.assertEqual((gyg["customer_pays"], gyg["revenue"], gyg["cost"], gyg["profit"]), ("100.00", "10.00", "0.00", "10.00"))

    def test_revenue_objective_can_choose_differently(self):
        product = analyse(self.offers(), objective="revenue", pax=2, as_of=date(2026, 11, 5))["products"][0]
        self.assertEqual((product["best"]["offer_id"], product["best"]["revenue"]), ("own:a", "120.00"))

    def test_unknown_commission_is_reported_and_never_chosen(self):
        product = analyse(self.offers(commission=None), objective="profit", pax=2, as_of=date(2026, 11, 5))["products"][0]
        gyg = next(row for row in product["alternatives"] if row["offer_id"] == "gyg:101")
        self.assertEqual((gyg["revenue"], gyg["profit"], gyg["unknown"]), (None, None, ["commission_rate"]))
        self.assertNotIn("gyg:101", [item["offer_id"] for item in product["cannibalization"]])

    def test_currencies_validity_and_minimum_group_are_respected(self):
        offers = self.offers() + [
            offer(offer_id="usd:a", source_id="usd", currency="USD", sell_price="70", lineage=lineage("usd")),
            offer(offer_id="old:a", source_id="old", sell_price="99", cost_price="1", valid_to="2026-01-31", lineage=lineage("old")),
            offer(offer_id="big:a", source_id="big", sell_price="99", cost_price="1", min_pax=6, lineage=lineage("big")),
        ]
        report = analyse(offers, objective="profit", pax=2, as_of=date(2026, 11, 5))
        self.assertEqual([(p["product_key"], p["currency"]) for p in report["products"]], [("sintra-day", "EUR"), ("sintra-day", "USD")])
        eur = report["products"][0]
        self.assertNotIn("old:a", [row["offer_id"] for row in eur["alternatives"]])
        big = next(row for row in eur["alternatives"] if row["offer_id"] == "big:a")
        self.assertFalse(big["eligible"])
        self.assertEqual(eur["best"]["offer_id"], "direct:a")
        with self.assertRaises(ValueError):
            analyse(offers, objective="volume")


class GatewayTest(unittest.TestCase):
    def call(self, app, path, query=""):
        captured = {}
        body = b"".join(app({"REQUEST_METHOD": "GET", "PATH_INFO": path, "QUERY_STRING": query, "wsgi.input": io.BytesIO()},
                            lambda status, headers: captured.update(status=status)))
        return captured["status"], json.loads(body)

    def test_margins_endpoint_joins_api_and_supplier_sources_with_lineage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "getyourguide" / "tours").mkdir(parents=True)
            (root / "suppliers" / "supplier-sintra").mkdir(parents=True)
            (root / "getyourguide" / "tours" / "sintra.json").write_text(json.dumps({"_metadata": {"query": "currency=eur"}, "data": {"tours": [
                {"tour_id": 101, "title": "Sintra day trip", "price": {"values": {"amount": 50}, "description": "per person"}},
                {"tour_id": 999, "title": "Not ours", "price": {"values": {"amount": 10}}}]}}), encoding="utf-8")
            (root / "suppliers" / "supplier-sintra" / "precos.csv").write_text(
                ",".join(COLUMNS) + "\nq1,Quinta,sintra-day,Sintra privado,direct,EUR,person,55,30,,,\nq1,Quinta,sintra-day,Sintra,direct,EUR,person,abc,30,,,\n", encoding="utf-8")
            app = create_app(root, {"getyourguide": {"source_id": "gyg", "commission_rate": "0.1", "product_mapping": {"101": "sintra-day"}}})
            status, report = self.call(app, "/v1/margins", "objective=profit&pax=2&as_of=2026-11-05")
            self.assertEqual(status, "200 OK")
            product = report["products"][0]
            self.assertEqual((product["best"]["offer_id"], product["channels"]), ("supplier-sintra:q1:sintra-day:open", ["direct", "reseller"]))
            gyg = next(row for row in product["alternatives"] if row["channel"] == "reseller")
            self.assertEqual(gyg["lineage"]["ref"], "sintra.json#data.tours[0]")
            self.assertIn("preço «a partir de»: indicativo", gyg["notes"])
            self.assertEqual(report["sources"], {"gyg": {"offers": 1, "rejected": 0}, "supplier-sintra": {"offers": 1, "rejected": 1}})
            self.assertEqual([item["tour_id"] for item in report["unmatched"]], [999])
            self.assertEqual(self.call(app, "/v1/margins", "discount=1")[0], "400 Bad Request")
            self.assertEqual(self.call(app, "/v1/margins", "pax=0")[0], "400 Bad Request")
            self.assertEqual(self.call(app, "/health")[1]["version"], "0.1.0")
            self.assertEqual(self.call(app, "/v1/openapi.json")[1]["info"]["title"], "NEXUS Integration Gateway")

    def test_the_default_config_keeps_the_commission_unknown(self):
        config = json.loads((ROOT / "config/nexus.json").read_text(encoding="utf-8"))
        self.assertIsNone(config["getyourguide"]["commission_rate"])


if __name__ == "__main__":
    unittest.main()
