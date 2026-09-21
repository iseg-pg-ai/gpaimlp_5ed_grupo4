import re
from pydantic import BaseModel
from services.common.bedrock import BedrockClient
from shared.schemas import TravellerProfile


class DNAInput(BaseModel):
    traveller_id: str
    form_answers: dict[str, str] = {}
    emails: list[str] = []
    party_size: int = 2


class DNAService:
    interests = {
        "culture": ["museum", "art", "history"],
        "food": ["food", "restaurant", "wine"],
        "nature": ["beach", "hike", "nature"],
        "wellness": ["spa", "relax"],
    }

    def build(self, source: DNAInput, enrich_with_llm: bool = False) -> TravellerProfile:
        corpus = " ".join([*source.form_answers.values(), *source.emails]).lower()
        found = [
            interest
            for interest, words in self.interests.items()
            if any(w in corpus for w in words)
        ] or ["culture"]
        pace = (
            "slow"
            if re.search(r"relax|slow|mobility|child", corpus)
            else "fast"
            if re.search(r"packed|active|adventure", corpus)
            else "balanced"
        )
        limits = [
            x
            for x in [
                "mobility" if "mobility" in corpus else None,
                "dietary" if any(x in corpus for x in ["vegan", "allergy", "gluten"]) else None,
            ]
            if x
        ]
        if enrich_with_llm:
            BedrockClient().complete(f"Classify traveller preferences safely: {corpus[:2000]}")
        return TravellerProfile(
            traveller_id=source.traveller_id,
            party_size=source.party_size,
            interests=found,
            pace=pace,
            limitations=limits,
            free_time_preference="high" if pace == "slow" else "medium",
        )
