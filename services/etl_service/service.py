from __future__ import annotations
import io
import json
from pathlib import Path
import pandas as pd
from pypdf import PdfReader
from tenacity import retry, stop_after_attempt, wait_exponential
from shared.logging import get_logger
from shared.schemas import ETLRecord
from shared.utils.aws import DynamoRepository, S3Repository

logger = get_logger(__name__)


class ETLPipeline:
    """Ingest → normalize/validate/dedupe → classify → persist pipeline."""

    def ingest(self, filename: str, content: bytes) -> list[dict]:
        suffix = Path(filename).suffix.lower()
        if suffix == ".csv":
            return pd.read_csv(io.BytesIO(content), encoding="utf-8-sig").to_dict("records")
        if suffix in {".xlsx", ".xls"}:
            return pd.read_excel(io.BytesIO(content)).to_dict("records")
        if suffix == ".json":
            value = json.loads(content.decode("utf-8-sig"))
            return value if isinstance(value, list) else [value]
        if suffix == ".pdf":
            text = "\n".join(
                page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages
            )
            return [{"text": text, "document_type": "blu_document"}]
        raise ValueError(f"Unsupported input: {suffix}")

    def clean(self, rows: list[dict]) -> list[dict]:
        seen, cleaned = set(), []
        for row in rows:
            item = {
                str(k).strip().lower().replace(" ", "_"): self._normalise(v)
                for k, v in row.items()
                if pd.notna(v)
            }
            fingerprint = json.dumps(item, sort_keys=True, default=str)
            if item and fingerprint not in seen:
                seen.add(fingerprint)
                cleaned.append(item)
        return cleaned

    @staticmethod
    def _normalise(value):
        return " ".join(value.strip().split()) if isinstance(value, str) else value

    def transform(self, rows: list[dict], source: str) -> list[ETLRecord]:
        result = []
        for row in rows:
            entity = row.get("entity_type") or self._entity_type(row)
            result.append(ETLRecord(source=source, entity_type=entity, payload=row))
        return result

    @staticmethod
    def _entity_type(row: dict) -> str:
        text = " ".join(map(str, row.values())).lower()
        if any(k in text for k in ("restaurant", "cuisine", "menu")):
            return "restaurant"
        if any(k in text for k in ("hotel", "transfer", "flight", "logistics")):
            return "logistics"
        if any(k in text for k in ("preference", "pace", "interest")):
            return "traveller_dna"
        return "attraction" if "attraction" in text else "experience"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))
    def load(self, records: list[ETLRecord], persist: bool = False) -> int:
        if persist:
            s3, dynamo = S3Repository(), DynamoRepository()
            for i, record in enumerate(records):
                data = record.model_dump()
                data["id"] = f"{record.source}:{i}"
                s3.put_json(f"curated/{data['id']}.json", data)
                dynamo.put(data)
        logger.info("etl_load_complete count=%s persist=%s", len(records), persist)
        return len(records)

    def run(self, filename: str, content: bytes, persist: bool = False) -> list[ETLRecord]:
        return self.transform(self.clean(self.ingest(filename, content)), filename)
