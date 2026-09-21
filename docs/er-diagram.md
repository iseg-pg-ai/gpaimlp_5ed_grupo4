# Modelo ER

```text
Traveller 1──* TravellerDNA
Traveller 1──* Itinerary 1──* ScheduledActivity *──1 Activity
Itinerary 1──1 PriceQuote
Itinerary 1──* ReservationTask
Activity *──0..1 Partner
```
