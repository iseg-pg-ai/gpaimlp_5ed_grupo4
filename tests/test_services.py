from datetime import date
from services.dna_service.service import DNAInput, DNAService
from services.etl_service.service import ETLPipeline
from services.itinerary_service.service import ItineraryService
from services.pricing_service.service import PricingInput, PricingService
from shared.schemas import Activity, ItineraryRequest, Tier


def test_etl_csv_deduplicates():
    result = ETLPipeline().run("a.csv", b"name,category\nMuseum,museum\nMuseum,museum\n")
    assert len(result) == 1 and result[0].entity_type == "experience"


def test_dna_extracts_food_preference():
    assert (
        "food"
        in DNAService()
        .build(DNAInput(traveller_id="t", emails=["We love wine and restaurants"]))
        .interests
    )


def test_itinerary_protects_slow_pace():
    dna = DNAService().build(DNAInput(traveller_id="t", form_answers={"pace": "relax slowly"}))
    activities = [
        Activity(id=str(i), name=f"A{i}", category="museum", duration_minutes=60, cost=10)
        for i in range(4)
    ]
    itinerary = ItineraryService().generate(
        ItineraryRequest(
            traveller=dna,
            destination="Lisbon",
            start_date=date.today(),
            days=1,
            activities=activities,
        )
    )
    assert len(itinerary.activities) <= 2


def test_signature_margin():
    quote = PricingService().quote(
        PricingInput(tier=Tier.SIGNATURE, party_size=2, experience_cost=100)
    )
    assert quote.margin == quote.subtotal * 0.32
