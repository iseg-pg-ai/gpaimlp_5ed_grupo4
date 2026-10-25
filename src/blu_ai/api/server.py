"""Serviço legado privado; o fluxo transacional usa o planeador do portal."""

from __future__ import annotations

import hmac
import os
from typing import Any, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from blu_ai.agents.curator_agent import chat_copilot, curate_itinerary
from blu_ai.schemas.brief import CustomerBrief
from blu_ai.tools.catalog_tools import search_blu_catalog
from blu_ai.tools.weather_tools import get_weather_forecast


def allowed_origins():
    """Aceitar apenas origens HTTP(S) exatas da configuração do servidor."""
    result = []
    for candidate in os.getenv("BLU_AGENT_ALLOWED_ORIGINS", "").split(","):
        candidate = candidate.strip()
        parsed = urlsplit(candidate)
        if (parsed.scheme in ("http", "https") and parsed.netloc and
                not parsed.username and not parsed.password and
                not parsed.path and not parsed.query and not parsed.fragment):
            result.append(candidate)
    return tuple(result)


def create_app():
    application = FastAPI(
        title="BLU AI Curator Agent API", version="1.0.0",
        docs_url=None, redoc_url=None, openapi_url=None,
    )
    origins = allowed_origins()

    @application.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path != "/api/health":
            token = os.getenv("BLU_AGENT_API_TOKEN", "")
            if not token:
                return JSONResponse({"detail": "Serviço não configurado para acesso autenticado."}, status_code=503)
            supplied = request.headers.get("authorization", "")
            if not hmac.compare_digest(supplied.encode("utf-8"), f"Bearer {token}".encode("utf-8")):
                return JSONResponse({"detail": "Acesso não autorizado."}, status_code=401)
            origin = request.headers.get("origin")
            if origin is not None and origin not in origins:
                return JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
        return await call_next(request)

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
        return JSONResponse({"detail": "Pedido inválido."}, status_code=422)

    @application.get("/api/health")
    def health_check():
        return {"status": "healthy", "service": "blu_ai_agent", "agentic_engine": "LangChain + LangGraph"}

    @application.post("/api/agent/curate")
    def api_curate_itinerary(brief: CustomerBrief):
        try:
            return curate_itinerary(brief)
        except Exception:
            raise HTTPException(status_code=503, detail="Agente indisponível.") from None

    @application.post("/api/agent/chat")
    def api_chat_copilot(req: ChatCopilotRequest):
        try:
            return chat_copilot(user_instruction=req.instruction, current_itinerary=req.currentItinerary, brief=req.brief)
        except Exception:
            raise HTTPException(status_code=503, detail="Agente indisponível.") from None

    @application.get("/api/tools/catalog")
    def api_search_catalog(query: Optional[str] = None, city: Optional[str] = None,
                           category: Optional[str] = None, limit: int = 6):
        try:
            return search_blu_catalog.invoke({"query": query, "city": city, "category": category, "max_results": limit})
        except Exception:
            raise HTTPException(status_code=503, detail="Catálogo indisponível.") from None

    @application.get("/api/tools/weather")
    def api_weather(city: str, date: str):
        try:
            return get_weather_forecast.invoke({"city": city, "date": date})
        except Exception:
            raise HTTPException(status_code=503, detail="Meteorologia indisponível.") from None

    if origins:
        # O preflight não contém dados operacionais nem exige o Bearer do pedido real.
        application.add_middleware(
            CORSMiddleware, allow_origins=list(origins), allow_credentials=False,
            allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],
        )
    return application


class ChatCopilotRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=4000)
    currentItinerary: Optional[Any] = None
    brief: Optional[Any] = None


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("blu_ai.api.server:app", host="127.0.0.1", port=8000, reload=False)
