import json
import boto3
from shared.config import settings


class BedrockClient:
    """Bedrock Converse adapter with a predictable local fallback."""

    def complete(self, prompt: str) -> str:
        try:
            client = boto3.client("bedrock-runtime", region_name=settings.blu_aws_region)
            response = client.converse(
                modelId=settings.bedrock_model_id,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
            )
            return response["output"]["message"]["content"][0]["text"]
        except Exception:
            return json.dumps(
                {
                    "mode": "fallback",
                    "note": "Configure AWS Bedrock credentials for LLM enrichment.",
                }
            )
