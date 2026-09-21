from pydantic import BaseModel, Field
from shared.schemas import PriceQuote, Tier


class PricingInput(BaseModel):
    tier: Tier
    party_size: int = Field(ge=1)
    partner_costs: list[float] = []
    transport_cost: float = 0
    guide_cost: float = 0
    experience_cost: float = 0


class PricingService:
    margins = {Tier.CLASSIC: 0.18, Tier.EXTENDED: 0.23, Tier.SIGNATURE: 0.32}
    tier_fees = {Tier.CLASSIC: 100, Tier.EXTENDED: 250, Tier.SIGNATURE: 500}

    def quote(self, value: PricingInput) -> PriceQuote:
        partners = sum(value.partner_costs)
        costs = {
            "partners": partners,
            "transport": value.transport_cost,
            "guides": value.guide_cost,
            "experiences": value.experience_cost,
            "tier_fee": self.tier_fees[value.tier],
        }
        subtotal = sum(costs.values())
        margin = round(subtotal * self.margins[value.tier], 2)
        return PriceQuote(
            tier=value.tier,
            subtotal=round(subtotal, 2),
            margin=margin,
            total=round(subtotal + margin, 2),
            breakdown=costs,
        )
