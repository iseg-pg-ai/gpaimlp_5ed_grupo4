"""ETL public integration boundary."""

from typing import Any

from .service import ETLPipeline


def process_form_responses(data: list[dict[str, Any]]):
    """Validate and transform live form records for downstream BLU consumers.

    Persistence is intentionally disabled here: the caller can decide when the
    raw/curated records should be committed to AWS.
    """
    pipeline = ETLPipeline()
    cleaned = pipeline.clean(data)
    return pipeline.transform(cleaned, source="google_forms")


__all__ = ["ETLPipeline", "process_form_responses"]
