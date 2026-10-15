"""FastAPI Service exposing the BLU AI Agent to the DMC Workspace and external consumers."""

from __future__ import annotations

import sys
import os
import hmac
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Ensure src is on path
ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR / "src") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "src"))

from blu_ai.schemas.brief import CustomerBrief
from blu_ai.agents.curator_agent import curate_itinerary, chat_copilot
from blu_ai.tools.catalog_tools import search_blu_catalog
from blu_ai.tools.weather_tools import get_weather_forecast
from blu_ai.tools.constraint_tools import validate_activity_constraints

app = FastAPI(
    title="BLU AI Curator Agent API",
    description="Intelligent Multi-Step Agentic Curation for BLU Coast DMC",
    version="1.0.0",
)

# Serviço legado entre servidores: sem CORS público; o portal usa o planeador AWS.
@app.middleware("http")
async def authenticate(request: Request, call_next):
    if request.url.path != "/api/health":
        token = os.getenv("BLU_AGENT_API_TOKEN")
        if not token:
            return JSONResponse({"detail": "Serviço não configurado para acesso autenticado."}, status_code=503)
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            return JSONResponse({"detail": "Acesso não autorizado."}, status_code=401)
    return await call_next(request)


class ChatCopilotRequest(BaseModel):
    instruction: str
    currentItinerary: Optional[Any] = None
    brief: Optional[Any] = None


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "blu_ai_agent",
        "agentic_engine": "LangChain + LangGraph",
    }


@app.post("/api/agent/curate")
def api_curate_itinerary(brief: CustomerBrief):
    """Executa o Agente LangGraph para gerar a proposta completa com raciocínio e auditoria."""
    try:
        result = curate_itinerary(brief)
        return result
    except Exception:
        raise HTTPException(status_code=503, detail="Agente indisponível.") from None


@app.post("/api/agent/chat")
def api_chat_copilot(req: ChatCopilotRequest):
    """Endpoint do Co-Pilot para comandos em linguagem natural e alterações em tempo real."""
    try:
        result = chat_copilot(
            user_instruction=req.instruction,
            current_itinerary=req.currentItinerary,
            brief=req.brief,
        )
        return result
    except Exception:
        raise HTTPException(status_code=503, detail="Agente indisponível.") from None


@app.get("/api/tools/catalog")
def api_search_catalog(query: Optional[str] = None, city: Optional[str] = None, category: Optional[str] = None, limit: int = 6):
    return search_blu_catalog.invoke({
        "query": query,
        "city": city,
        "category": category,
        "max_results": limit,
    })


@app.get("/api/tools/weather")
def api_weather(city: str, date: str):
    return get_weather_forecast.invoke({"city": city, "date": date})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("blu_ai.api.server:app", host="0.0.0.0", port=8000, reload=True)
