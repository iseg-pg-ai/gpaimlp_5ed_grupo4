"""Exportação TXT/Canva do snapshot; apenas os campos destinados ao cliente."""
import json


def pick(source: dict, mapping: dict) -> dict:
    """Omitir campos ausentes, tal como JSON.stringify para propriedades undefined."""
    return {target: source[key] for target, key in mapping.items() if key in source}


def amount(cents):
    return None if cents is None else cents / 100


def json_numbers(value):
    # JSON.stringify escreve números inteiros sem parte decimal, incluindo -0.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [json_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: json_numbers(item) for key, item in value.items()}
    return value


def render_prompt(payload: dict) -> str:
    snapshot, meta, budget = payload["snapshot"], payload["meta"], payload["budget"]
    brief = snapshot["brief"]
    proposal = {
        "formato": "blu-roteiro-canva/1.1.0",
        "versao": pick(meta, {"viagem": "tripId", "numero": "version", "criadaEm": "createdAt", "hashSnapshot": "snapshotHash"}),
        "estado": "Proposta preliminar para revisão do curador",
        "idiomaSaida": payload["languageName"], "codigoIdioma": payload["locale"],
        "modeloVisual": {"url": "https://canva.link/5u8zxudd1vkcbth", "designId": "DAHDpPXVRsU",
                         "titulo": "LISBON IN PERSPECTIVE", "baseConteudo": "PDFs de proposta do DMC Workspace"},
        **pick(brief, {"cliente": "customerName", "destino": "destination"}),
        "datas": pick(brief, {"inicio": "startDate", "fim": "endDate"}),
        "participantes": pick(brief, {"adultos": "adults", "criancas": "children"}),
        **pick(brief, {"chegada": "arrivalLocation", "partida": "departureLocation", "nivel": "proposalTier",
                       "ritmo": "pace", "esforco": "physicalEffort", "inicioPreferido": "morningPreference", "interesses": "interests"}),
        "restricoes": pick(brief, {"mobilidade": "mobilityRestrictions", "alimentacao": "dietaryRestrictions", "exclusoes": "exclusions"}),
        **pick(brief, {"alojamento": "accommodation", "ritmoRefeicoes": "diningPace"}),
        "personalizacao": pick(brief["personalization"], {
            "imperdiveis": "mustHave", "evitar": "avoid", "flexibilidadeOrcamentoPercentagem": "budgetFlex",
            "pausasExtra": "extraBreaks", "acompanhamento": "accompaniment", "idiomaGuia": "guideLanguage"
        }) if brief.get("personalization") is not None else None,
        "dias": [],
    }
    for day_index, day in enumerate(snapshot["itinerary"]):
        route = day.get("routeSummary")
        output = {
            **pick(day, {"numero": "dayNumber", "data": "date", "titulo": "title", "local": "location"}),
            "resumo": day.get("summary") or "",
            "nivel": day.get("tier") if day.get("tier") is not None else brief.get("proposalTier"),
            "capacidadeDiaria": day.get("dailyCapacity"),
            "resumoDeslocacoes": {**pick(route, {"tempoTotal": "totalTransitTime", "distanciaTotal": "totalDistance",
                                               "numeroPercursos": "legsCount", "distanciaAPe": "walkingDistance",
                                               "sequencia": "routePath", "estadoOtimizacao": "algorithmStatus"}),
                                   "ressalva": "Estimativa guardada; não confirma trânsito, acessibilidade ou disponibilidade"} if route is not None else None,
            "atividades": [],
        }
        for item_index, item in enumerate(day["items"]):
            confirmation, transit = item.get("confirmation"), item.get("transitToNext")
            activity = {**pick(item, {"id": "id"}), "horario": item.get("time") or "Por agendar",
                        **pick(item, {"titulo": "title"}), "descricao": item.get("description") or "",
                        **pick(item, {"categoria": "category"}), "local": item.get("location") or "",
                        "duracao": item.get("duration") or ""}
            if confirmation is not None:
                activity.update(pick(confirmation, {"preco": "price"}))
            else:
                activity["preco"] = item.get("priceNote") or ""
            activity.update({
                "estado": "Confirmado pelo curador" if confirmation and confirmation.get("status") == "confirmed" else "Por confirmar",
                "protegida": bool(item.get("isLocked")), "fonte": item.get("source") if item.get("source") is not None else "Não indicada",
                "notasAcessibilidade": item.get("accessibilityNotes") or "", "notasAlimentares": item.get("dietaryNotes") or "",
                "pendencias": payload["checks"][day_index][item_index],
                "deslocacao": {**pick(transit, {"origem": "fromLocation", "destino": "toLocation", "modo": "mode", "duracao": "duration"}),
                                "distancia": transit.get("distance") or "", "margemMinutos": transit.get("bufferMinutes"),
                                "nota": transit.get("routeNote") or "", "estado": "Estimativa; percurso não verificado"} if transit is not None else None,
            })
            output["atividades"].append(activity)
        proposal["dias"].append(output)
    proposal["orcamento"] = {
        "disponivel": pick(brief, {"valor": "budget", "moeda": "currency"}),
        "discriminacao": [{**pick(line, {"descricao": "description", "quantidade": "quantity", "unidade": "unit"}),
                           "valorUnitario": amount(line["unitCents"]), "subtotal": amount(line["subtotalCents"]),
                           **pick(line, {"moeda": "currency", "estado": "status", "nota": "notes"})} for line in budget["lines"]],
        "totaisPorMoeda": {currency: {"confirmado": amount(totals["confirmed"]), "estimado": amount(totals["estimated"])}
                           for currency, totals in budget["totals"].items()},
        "incompleto": budget["incomplete"], "condicoes": budget["terms"],
    }
    proposal.update(pick(snapshot, {"pendencias": "pending"}))
    return payload["instructions"].strip() + "\n\n" + json.dumps(json_numbers(proposal), ensure_ascii=False, indent=2) + "\n"
