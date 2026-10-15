"""Pydantic schemas for Itinerary and Activity items."""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class TransitLeg(BaseModel):
    id: str
    fromLocation: str
    toLocation: str
    mode: Literal["chauffeur", "walk", "boat", "train", "funicular"] = "chauffeur"
    duration: str = "20 min"
    distance: Optional[str] = "5.0 km"
    routeNote: Optional[str] = None
    bufferMinutes: int = 15
    isAlgorithmOptimized: bool = True
    algorithmNote: Optional[str] = None


class ActivityItem(BaseModel):
    id: str
    time: str = Field(description="Horário no formato HH:MM (ex: 09:30)")
    title: str
    description: Optional[str] = ""
    category: Literal["hotel", "activity", "restaurant", "transport", "free_time"]
    location: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    duration: Optional[str] = "1h 30m"
    priceNote: Optional[str] = None
    effortLevel: Optional[Literal["Baixo", "Moderado", "Alto"]] = "Moderado"
    dietaryNotes: Optional[str] = None
    accessibilityNotes: Optional[str] = None
    isRecentlyModified: bool = False
    isLocked: bool = False
    transitToNext: Optional[TransitLeg] = None
    source: Optional[str] = "catalog"
    appliedRules: List[str] = Field(default_factory=list)
    pendingChecks: List[str] = Field(default_factory=list)


class ItineraryDay(BaseModel):
    dayNumber: int
    date: str = Field(description="Formato YYYY-MM-DD")
    title: str
    location: str
    summary: Optional[str] = ""
    tier: Optional[Literal["Soft", "Classic", "Signature"]] = "Classic"
    items: List[ActivityItem] = Field(default_factory=list)
    dailyCapacity: Optional[int] = 4


class AgentCuratorResponse(BaseModel):
    reasoning: str = Field(description="Explicação da curadoria e regras aplicadas")
    itinerary: List[ItineraryDay] = Field(description="Lista de dias do itinerário planeado")
    ruleAudits: List[str] = Field(default_factory=list, description="Regras BLU verificadas pelo agente")
    pendingValidations: List[str] = Field(default_factory=list, description="Itens que exigem confirmação do curador humano")
