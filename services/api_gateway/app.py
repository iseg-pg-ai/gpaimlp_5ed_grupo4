from collections import defaultdict
from time import monotonic
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from services.crm_service.service import CRMService
from services.dna_service.service import DNAInput, DNAService
from services.etl_service.service import ETLPipeline
from services.itinerary_service.service import ItineraryService
from services.pricing_service.service import PricingInput, PricingService
from services.reservation_service.service import ReservationService
from shared.schemas import (
    Itinerary,
    ItineraryRequest,
    PriceQuote,
    ReservationTask,
    TravellerProfile,
)
from shared.security import create_access_token, verify_token

app = FastAPI(
    title="BLU AI System API",
    version="0.1.0",
    description="Gateway for intelligent itinerary services.",
)
auth = HTTPBearer(auto_error=False)
hits: dict[str, list[float]] = defaultdict(list)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    key, now = request.client.host if request.client else "unknown", monotonic()
    hits[key] = [t for t in hits[key] if now - t < 60]
    if len(hits[key]) >= 120:
        raise HTTPException(429, "Rate limit exceeded")
    hits[key].append(now)
    return await call_next(request)


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(auth)) -> dict:
    if not credentials:
        raise HTTPException(401, "Bearer token required")
    return verify_token(credentials.credentials)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/token")
def token(subject: str):
    return {"access_token": create_access_token(subject), "token_type": "bearer"}


@app.post("/etl/upload")
async def etl_upload(file: UploadFile = File(...), _: dict = Depends(current_user)):
    records = ETLPipeline().run(file.filename or "upload.json", await file.read())
    return {"records": [r.model_dump() for r in records], "count": len(records)}


@app.post("/dna", response_model=TravellerProfile)
def dna(input: DNAInput, _: dict = Depends(current_user)):
    return DNAService().build(input)


@app.post("/itineraries", response_model=Itinerary)
def itinerary(request: ItineraryRequest, _: dict = Depends(current_user)):
    return ItineraryService().generate(request)


@app.post("/pricing/quote", response_model=PriceQuote)
def quote(value: PricingInput, _: dict = Depends(current_user)):
    return PricingService().quote(value)


@app.post("/reservations/plan", response_model=list[ReservationTask])
def reservations(itinerary: Itinerary, _: dict = Depends(current_user)):
    return ReservationService().plan(itinerary)


@app.post("/crm/{event}")
async def crm(event: str, email: str, _: dict = Depends(current_user)):
    if event not in {"pre_trip", "post_trip", "follow_up"}:
        raise HTTPException(404, "Unknown CRM event")
    return await CRMService().trigger(event, email)
