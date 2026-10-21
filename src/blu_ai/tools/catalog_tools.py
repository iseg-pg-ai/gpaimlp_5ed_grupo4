"""LangChain Tools for searching and filtering the BLU catalog."""

from __future__ import annotations

import sqlite3
from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from blu_ai.config import DATABASE_PATH


class CatalogSearchParams(BaseModel):
    query: Optional[str] = Field(default=None, description="Termo de pesquisa textual (ex: 'vinho', 'fado', 'museu', 'jardim')")
    category: Optional[str] = Field(default=None, description="Categoria: 'atracoes', 'restaurantes', 'experiencias', ou None para todas")
    city: Optional[str] = Field(default=None, description="Cidade (ex: 'Lisboa', 'Porto', 'Sintra', 'Cascais', 'Evora')")
    max_results: int = Field(default=6, description="Número máximo de registos a devolver")


@tool("search_blu_catalog", args_schema=CatalogSearchParams)
def search_blu_catalog(
    query: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    max_results: int = 6
) -> List[Dict[str, Any]]:
    """Pesquisa itens verificados no catálogo BLU (atrações, restaurantes ou experiências).
    Utilize esta ferramenta para encontrar atividades autênticas adequadas aos interesses do cliente.
    """
    if not DATABASE_PATH.exists():
        return [{"error": f"Base de dados não encontrada em {DATABASE_PATH}"}]

    conn = sqlite3.connect(f"file:{DATABASE_PATH.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    results: List[Dict[str, Any]] = []

    try:
        cur = conn.cursor()
        tables_to_query = []
        if category in ("atracoes", "restaurantes", "experiencias"):
            tables_to_query.append(category)
        else:
            tables_to_query = ["atracoes", "restaurantes", "experiencias"]

        for tbl in tables_to_query:
            conditions = []
            params = []

            if city:
                if tbl in ("atracoes", "restaurantes"):
                    conditions.append("LOWER(cidade) LIKE ?")
                else:
                    conditions.append("LOWER(localizacao) LIKE ?")
                params.append(f"%{city.lower()}%")

            if query:
                q_term = f"%{query.lower()}%"
                if tbl == "atracoes":
                    conditions.append("(LOWER(nome_da_atracao) LIKE ? OR LOWER(descricao_curada) LIKE ? OR LOWER(categoria) LIKE ?)")
                    params.extend([q_term, q_term, q_term])
                elif tbl == "restaurantes":
                    conditions.append("(LOWER(estabelecimento) LIKE ? OR LOWER(tipo_gastronomia_base) LIKE ? OR LOWER(zona_localidade) LIKE ?)")
                    params.extend([q_term, q_term, q_term])
                elif tbl == "experiencias":
                    conditions.append("(LOWER(nome_da_experiencia) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(categoria) LIKE ?)")
                    params.extend([q_term, q_term, q_term])

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            sql = f"SELECT * FROM {tbl} {where_clause} LIMIT ?"
            params.append(max_results)

            for row in cur.execute(sql, params).fetchall():
                d = dict(row)
                d["_source_table"] = tbl
                # Normalize title and description fields for the agent
                if tbl == "atracoes":
                    d["title"] = d.get("nome_da_atracao")
                    d["description"] = d.get("descricao_curada")
                    d["location"] = d.get("cidade")
                elif tbl == "restaurantes":
                    d["title"] = d.get("estabelecimento")
                    d["description"] = f"Gastronomia: {d.get('tipo_gastronomia_base')}. Horário: {d.get('horario_base_reconfirmar')}"
                    d["location"] = d.get("cidade")
                elif tbl == "experiencias":
                    d["title"] = d.get("nome_da_experiencia")
                    d["description"] = d.get("descricao")
                    d["location"] = d.get("localizacao")

                results.append(d)

    finally:
        conn.close()

    return results[:max_results]
