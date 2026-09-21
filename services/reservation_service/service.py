from datetime import datetime, timedelta, timezone
from shared.schemas import Itinerary, ReservationTask


class ReservationService:
    def plan(self, itinerary: Itinerary) -> list[ReservationTask]:
        start = datetime.combine(
            itinerary.request.start_date, datetime.min.time(), tzinfo=timezone.utc
        )
        tasks = []
        for activity in itinerary.activities:
            if activity.partner or activity.category in {"experience", "restaurant", "museum"}:
                lead_days = 30 if activity.category == "experience" else 14
                tasks.append(
                    ReservationTask(
                        activity_id=activity.id,
                        supplier=activity.partner,
                        due_at=start - timedelta(days=lead_days),
                    )
                )
        return tasks
