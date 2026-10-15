"""Pydantic schemas for Customer Brief and constraints."""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Personalization(BaseModel):
    mustHave: List[str] = Field(default_factory=list, description="Subcategorias obrigatórias")
    avoid: List[str] = Field(default_factory=list, description="Subcategorias a evitar")
    accompaniment: Literal["any", "self", "guided", "private"] = "any"
    guideLanguage: Optional[str] = None
    extraBreaks: bool = False
    budgetFlex: int = 0
    groupNeeds: Optional[str] = None


class CustomerBrief(BaseModel):
    customerName: str
    customerEmail: Optional[str] = None
    destination: str
    startDate: str = Field(description="Data de início formato YYYY-MM-DD")
    endDate: str = Field(description="Data de fim formato YYYY-MM-DD")
    arrivalLocation: Optional[str] = ""
    departureLocation: Optional[str] = ""
    adults: int = Field(default=2, ge=1)
    children: int = Field(default=0, ge=0)
    childrenAges: Optional[str] = ""
    budget: float = Field(default=2500.0, gt=0)
    currency: Literal["EUR"] = "EUR"
    interests: List[str] = Field(default_factory=list)
    exclusions: List[str] = Field(default_factory=list)
    pace: Literal["Relaxed", "Balanced", "Active"] = "Balanced"
    proposalTier: Literal["Soft", "Classic", "Signature"] = "Classic"
    physicalEffort: Literal["Baixo (Low)", "Moderado (Moderate)", "Alto (High)"] = "Moderado (Moderate)"
    morningPreference: Literal["Early (08:30)", "Standard (09:30)", "Late Start (10:30+)"] = "Standard (09:30)"
    diningPace: Literal["Quick Lunch (~40m)", "Relaxed Dining (~90m)", "Tasting Experience (120m+)"] = "Relaxed Dining (~90m)"
    mobilityRestrictions: List[str] = Field(default_factory=list)
    dietaryRestrictions: List[str] = Field(default_factory=list)
    accommodation: Optional[str] = "4 star"
    specialOccasion: Optional[str] = ""
    notes: Optional[str] = ""
    personalization: Optional[Personalization] = None
