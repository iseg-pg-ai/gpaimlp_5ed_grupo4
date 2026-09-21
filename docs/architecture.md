# Arquitetura

```text
Cliente/Next.js → API Gateway (JWT, limites) → DNA | Itinerary | Pricing | Reservations | CRM
                                      ↓
ETL → S3 raw/curated → DynamoDB (catálogo) / Aurora (transacional)
                                      ↓
Google/Geoapify/OpenWeather/TripAdvisor/Uber/Bolt + Amazon Bedrock
```

Cada serviço é importável e pode ser extraído para um contentor ECS próprio. A gateway é a composição local inicial; em produção, use API Gateway/ALB com rotas por serviço e secrets em AWS Secrets Manager.
