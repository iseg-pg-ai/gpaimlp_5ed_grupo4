from shared.schemas import Activity, TravellerProfile
from services.common.bedrock import BedrockClient


class CurationService:
    limits = {"slow": 2, "balanced": 3, "fast": 4}

    def curate(
        self,
        traveller: TravellerProfile,
        activities: list[Activity],
        days: int,
        use_llm: bool = False,
    ) -> tuple[list[Activity], list[str]]:
        selected, exclusions, daily_categories = [], [], [set() for _ in range(days)]
        per_day = self.limits.get(traveller.pace, 3)
        for activity in sorted(
            activities, key=lambda a: (not bool(set(a.tags) & set(traveller.interests)), a.cost)
        ):
            day = min(
                range(days), key=lambda i: sum(1 for x in selected if getattr(x, "_day", 0) == i)
            )
            used = sum(1 for x in selected if getattr(x, "_day", 0) == day)
            if used >= per_day:
                exclusions.append(f"{activity.name}: protects free time")
                continue
            if (
                activity.category in {"palace", "museum"}
                and activity.category in daily_categories[day]
            ):
                exclusions.append(f"{activity.name}: avoids repetition")
                continue
            activity.__dict__["_day"] = day
            daily_categories[day].add(activity.category)
            selected.append(activity)
        if use_llm:
            BedrockClient().complete("Review itinerary diversity and avoid rushed schedules.")
        return selected, exclusions
