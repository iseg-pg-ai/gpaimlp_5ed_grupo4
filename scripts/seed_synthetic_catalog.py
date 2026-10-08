"""Complete missing local catalog data with deterministic demonstration values.

The generated values are deliberately labelled as synthetic. Existing catalog
values are never replaced, except explicit placeholders such as "Por confirmar".
Each changed record receives a normal catalog revision so the operation remains
auditable and can be inspected through the portal history.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


SYNTHETIC = "[DADO SINTÉTICO PARA TESTE]"
PLACEHOLDERS = {"", "por confirmar", "a confirmar", "desconhecido", "não indicado"}
FIELDS = (
    "name", "location", "address", "description", "duration", "price", "contacts",
    "accessibility", "source", "effort", "kind", "hours", "cuisine", "dietary",
    "provider", "modality",
)
INTERESTS = [
    "Culture & Heritage", "Gastronomy & Petiscos", "Douro & Alentejo Wines",
    "Atlantic Coast & Nature", "Tile Craft & Architecture",
    "Fado & Traditional Music", "Local Markets & Artisans",
    "Contemporary Art (Serralves)", "Bespoke Wellness & Spas",
]
def missing(value: Any) -> bool:
    return str(value or "").strip().casefold() in PLACEHOLDERS


def stable_number(identifier: str, minimum: int, maximum: int) -> int:
    digest = int(hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:8], 16)
    return minimum + digest % (maximum - minimum + 1)


def inferred_interests(record: dict[str, Any]) -> list[str]:
    text = " ".join(str(value) for value in record.get("fields", {}).values()).casefold()
    rules = [
        (("restaurante", "gastronom", "cozinha", "petisco", "mercado"), "Gastronomy & Petiscos"),
        (("vinho", "douro", "adega", "enotur"), "Douro & Alentejo Wines"),
        (("praia", "mar", "barco", "natureza", "parque", "jardim"), "Atlantic Coast & Nature"),
        (("azulejo", "arquitet"), "Tile Craft & Architecture"),
        (("fado", "música", "musica"), "Fado & Traditional Music"),
        (("mercado", "artesan", "bairro"), "Local Markets & Artisans"),
        (("contempor", "serralves"), "Contemporary Art (Serralves)"),
        (("spa", "bem-estar", "relax"), "Bespoke Wellness & Spas"),
        (("museu", "histór", "histor", "patrim", "monumento", "igreja"), "Culture & Heritage"),
    ]
    matches = [interest for words, interest in rules if any(word in text for word in words)]
    if not matches:
        matches = [
            "Gastronomy & Petiscos" if record["category"] == "restaurantes"
            else "Culture & Heritage"
        ]
    return list(dict.fromkeys(matches))[:3]


def default_subcategory(record: dict[str, Any]) -> str:
    return {
        "atracoes": "Monumento e património histórico",
        "restaurantes": "Cozinha tradicional portuguesa",
        "experiencias": "Visita guiada",
    }[record["category"]]


def complete_record(record: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    category = record["category"]
    identifier = record["id"]
    fields = {key: str(record.get("fields", {}).get(key, "")) for key in FIELDS}
    changed: list[str] = []

    def fill(key: str, value: str) -> None:
        if missing(fields[key]):
            fields[key] = value
            changed.append(f"fields.{key}")

    fill("location", "Lisboa")
    fill("address", f"Morada de demonstração, {fields['location']} · {SYNTHETIC}")
    fill("description", f"Descrição de demonstração de {fields['name']} · {SYNTHETIC}")
    fill("duration", f"{stable_number(identifier + ':duration', 2, 4) * 30} min · {SYNTHETIC}")
    fill("contacts", f"demo+{identifier[-8:]}@example.test · {SYNTHETIC}")
    fill("accessibility", f"Condições de acessibilidade simuladas, sem validação do fornecedor · {SYNTHETIC}")
    if fields["accessibility"].startswith("Acesso sem degraus") and SYNTHETIC in fields["accessibility"]:
        fields["accessibility"] = (
            f"Condições de acessibilidade simuladas, sem validação do fornecedor · {SYNTHETIC}"
        )
        changed.append("fields.accessibility")
    fill("source", f"Gerador local de dados de demonstração · {SYNTHETIC}")
    fill("effort", ["Baixo", "Moderado"][stable_number(identifier + ':effort', 0, 1)])
    fill("hours", (
        f"12:00–15:00; 19:00–23:00 · {SYNTHETIC}"
        if category == "restaurantes"
        else f"09:30–18:00 · {SYNTHETIC}"
    ))
    if category == "atracoes":
        fill("kind", "Cultural")
    elif category == "restaurantes":
        fill("cuisine", "Cozinha tradicional portuguesa")
        fill("dietary", f"Opções vegetarianas e alergénios sujeitos a validação · {SYNTHETIC}")
    else:
        fill("kind", "Experiência cultural")
        fill("provider", f"Fornecedor de demonstração BLU · {SYNTHETIC}")
        fill("modality", "Privada")

    record["fields"] = fields
    if not record.get("subcategory"):
        record["subcategory"] = default_subcategory(record)
        changed.append("subcategory")

    pricing = record.get("pricing")
    if not pricing or pricing.get("status") == "pending" or not pricing.get("amount"):
        price_ranges = {"atracoes": (8, 35), "restaurantes": (25, 85), "experiencias": (45, 180)}
        low, high = price_ranges[category]
        record["pricing"] = {
            "amount": str(stable_number(identifier + ":price", low, high)),
            "currency": "EUR", "unit": "person", "status": "estimated",
        }
        changed.append("pricing")

    operational = dict(record.get("operational") or {})
    defaults = {
        "latitude": f"{38.70 + stable_number(identifier + ':lat', 0, 6999) / 100000:.5f}",
        "longitude": f"{-9.22 + stable_number(identifier + ':lon', 0, 9999) / 100000:.5f}",
        "closures": f"Sem encerramentos registados no cenário de teste · {SYNTHETIC}",
        "observations": f"Condições operacionais simuladas para validação do portal · {SYNTHETIC}",
        "reservations": f"Reserva recomendada; disponibilidade não confirmada · {SYNTHETIC}",
    }
    for key, value in defaults.items():
        if missing(operational.get(key)):
            operational[key] = value
            changed.append(f"operational.{key}")
    record["operational"] = operational

    synthetic_matching = SYNTHETIC in str((record.get("matching") or {}).get("verificationNotes", ""))
    if not record.get("matching") or synthetic_matching:
        previous_matching = record.get("matching")
        record["matching"] = {
            "interests": inferred_interests(record),
            "tiers": ["Soft", "Classic", "Signature"],
            "paces": ["Relaxed", "Balanced", "Active"],
            "mornings": ["Early (08:30)", "Standard (09:30)", "Late Start (10:30+)"],
            "diningPaces": ["Quick Lunch (~40m)", "Relaxed Dining (~90m)", "Tasting Experience (120m+)"],
            # Synthetic descriptions are useful for layout and scheduling tests, but
            # must never count as verified safety or accessibility evidence.
            "mobilitySupported": [],
            "dietarySupported": [],
            "excludedBy": [],
            "food": "yes" if category == "restaurantes" else "no",
            "children": "allowed", "minAge": None, "maxGroup": 20,
            "pricePerPerson": float(record["pricing"]["amount"]),
            "validFrom": "", "validUntil": "",
            "verificationNotes": f"Compatibilidade geral simulada; mobilidade e alimentação não verificadas · {SYNTHETIC}",
        }
        if record["matching"] != previous_matching:
            changed.append("matching")

    return record, changed


def seed(database: Path, apply: bool) -> dict[str, Any]:
    if not database.exists():
        raise FileNotFoundError(f"Catálogo não encontrado: {database}")
    changed_records = 0
    changed_fields = 0
    by_category: dict[str, int] = {}
    with closing(sqlite3.connect(database)) as connection:
        rows = connection.execute("SELECT id, snapshot FROM catalog_records ORDER BY id").fetchall()
        updates = []
        for identifier, snapshot in rows:
            record, changed = complete_record(json.loads(snapshot))
            if not changed:
                continue
            record["revision"] = int(record["revision"]) + 1
            record["updatedAt"] = datetime.now(UTC).isoformat()
            record["reason"] = f"Preenchimento sintético para teste funcional ({len(changed)} campos/grupos)."
            updates.append((identifier, record))
            changed_records += 1
            changed_fields += len(changed)
            by_category[record["category"]] = by_category.get(record["category"], 0) + 1
        if apply and updates:
            connection.execute("BEGIN IMMEDIATE")
            for identifier, record in updates:
                snapshot = json.dumps(record, ensure_ascii=False)
                connection.execute(
                    "INSERT INTO catalog_history (id, revision, snapshot) VALUES (?, ?, ?)",
                    (identifier, record["revision"], snapshot),
                )
                connection.execute(
                    "UPDATE catalog_records SET snapshot = ? WHERE id = ?", (snapshot, identifier)
                )
            connection.commit()
    return {
        "mode": "aplicado" if apply else "simulação",
        "records_scanned": len(rows), "records_changed": changed_records,
        "values_completed": changed_fields, "by_category": by_category,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Preencher lacunas do catálogo com dados sintéticos.")
    parser.add_argument("--database", type=Path, default=Path("data/portal/catalog.sqlite"))
    parser.add_argument("--apply", action="store_true", help="Aplicar as alterações; sem esta opção apenas simula.")
    parser.add_argument("--backup", action="store_true", help="Criar uma cópia .bak antes de aplicar.")
    args = parser.parse_args()
    if args.apply and args.backup:
        shutil.copy2(args.database, args.database.with_suffix(".sqlite.bak"))
    print(json.dumps(seed(args.database, args.apply), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
