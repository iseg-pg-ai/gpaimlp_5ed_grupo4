from uuid import uuid4
from services.curation_service.service import CurationService
from shared.schemas import Itinerary, ItineraryRequest, ScheduledActivity, Tier


class ItineraryService:
    starts = {Tier.CLASSIC: "10:00", Tier.EXTENDED: "09:30", Tier.SIGNATURE: "09:00"}

    def generate(self, request: ItineraryRequest) -> Itinerary:
        curated, exclusions = CurationService().curate(
            request.traveller, request.activities, request.days
        )
        scheduled = []
        for index, activity in enumerate(curated):
            day = activity.__dict__.pop("_day", index % request.days) + 1
            scheduled.append(
                ScheduledActivity(
                    **activity.model_dump(),
                    day=day,
                    start_time=self.starts[request.tier],
                    travel_minutes=20 if index else 0,
                    rationale="Matches traveller DNA; includes logistical buffer.",
                )
            )
        return Itinerary(
            id=str(uuid4()), request=request, activities=scheduled, exclusions=exclusions
        )

    @staticmethod
    def proposal_markdown(itinerary: Itinerary) -> str:
        lines = [
            f"# {itinerary.request.destination} — {itinerary.request.tier.value.title()} itinerary"
        ]
        for item in itinerary.activities:
            lines.append(f"- Day {item.day}, {item.start_time}: **{item.name}** ({item.rationale})")
        return "\n".join(lines)
