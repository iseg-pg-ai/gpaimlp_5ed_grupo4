"""FastAPI Service exposing the BLU AI Agent to the DMC Workspace and external consumers."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

# Enable CORS for DMC Workspace (running on port 3000 / 3001)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na execução do agente: {str(e)}")


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no Co-Pilot: {str(e)}")


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
