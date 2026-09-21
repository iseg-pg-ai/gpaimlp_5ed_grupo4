# API

Obtenha um JWT em `POST /auth/token?subject=...`; envie-o como `Authorization: Bearer <token>`.

- `POST /etl/upload`: CSV, Excel, JSON ou PDF multipart.
- `POST /dna`: corpo `DNAInput`; retorna o perfil de DNA.
- `POST /itineraries`: corpo `ItineraryRequest`.
- `POST /pricing/quote`, `POST /reservations/plan`, `POST /crm/{pre_trip|post_trip|follow_up}`.

A especificação interativa está em `/docs` ao executar a aplicação.
