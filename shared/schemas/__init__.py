from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any
from pydantic import BaseModel, Field


class Tier(StrEnum):
    CLASSIC = "classic"
    EXTENDED = "extended"
    SIGNATURE = "signature"


class TravellerProfile(BaseModel):
    traveller_id: str
    party_size: int = Field(ge=1, le=20)
    interests: list[str] = []
    pace: str = "balanced"
    limitations: list[str] = []
    free_time_preference: str = "medium"


class Activity(BaseModel):
    id: str
    name: str
    category: str
    duration_minutes: int = Field(gt=0)
    cost: float = Field(ge=0)
    location: str = ""
    tags: list[str] = []
    partner: str | None = None


class ItineraryRequest(BaseModel):
    traveller: TravellerProfile
    destination: str
    start_date: date
    days: int = Field(ge=1, le=30)
    tier: Tier = Tier.CLASSIC
    activities: list[Activity] = []


class ScheduledActivity(Activity):
    day: int
    start_time: str
    travel_minutes: int = 0
    rationale: str = ""


class Itinerary(BaseModel):
    id: str
    request: ItineraryRequest
    activities: list[ScheduledActivity]
    exclusions: list[str] = []
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PriceQuote(BaseModel):
    currency: str = "EUR"
    tier: Tier
    subtotal: float
    margin: float
    total: float
    breakdown: dict[str, float]


class ReservationTask(BaseModel):
    activity_id: str
    due_at: datetime
    supplier: str | None = None
    status: str = "pending"


class ETLRecord(BaseModel):
    source: str
    entity_type: str
    payload: dict[str, Any]
