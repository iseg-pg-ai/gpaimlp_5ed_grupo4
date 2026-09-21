from dataclasses import dataclass
import httpx
from shared.config import settings


@dataclass
class CRMService:
    async def trigger(self, event: str, contact_email: str, properties: dict | None = None) -> dict:
        payload = {"event": event, "email": contact_email, "properties": properties or {}}
        if not settings.crm_api_key:
            return {**payload, "status": "queued-local"}
        if settings.crm_provider == "hubspot":
            async with httpx.AsyncClient() as c:
                r = await c.post(
                    "https://api.hubapi.com/automation/v4/flows/enrollments",
                    json=payload,
                    headers={"Authorization": f"Bearer {settings.crm_api_key}"},
                )
                r.raise_for_status()
                return {**payload, "status": "sent"}
        return {**payload, "status": "provider-adapter-required"}

    async def pre_trip(self, email: str):
        return await self.trigger("pre_trip", email)

    async def post_trip(self, email: str):
        return await self.trigger("post_trip", email)

    async def follow_up(self, email: str):
        return await self.trigger("follow_up", email)
