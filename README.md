# ISEG / 5ed / Grupo 4 - Trabalho final
[ Fernando, Gisela, Henrique, Manuel, Pedro ]

# BLU AI System

Plataforma de itinerários inteligentes: ingestão ETL, DNA do viajante, curadoria baseada em regras, itinerários por tier, preços, reservas, CRM e integrações AWS/Bedrock.

## Arranque rápido

```bash
cp .env.example .env
docker compose up --build
# ou: pip install -e ".[dev]" && uvicorn services.api_gateway.app:app --reload
```

Abra `http://localhost:8000/docs`. Para uma chamada autenticada, crie um token com `POST /auth/token?subject=demo` e use-o no botão **Authorize**.

## Componentes

- `services/etl_service`: ingestão, limpeza, transformação e persistência opcional em S3/DynamoDB.
- `services/dna_service`, `curation_service`, `itinerary_service`: decisão explicável e Bedrock opcional.
- `services/pricing_service`, `reservation_service`, `crm_service`: operações comerciais.
- `services/api_gateway`: FastAPI, OpenAPI, JWT e limitação por IP.
- `services/forms_ingestion_service`: refresh direto, sem cache, de respostas Google Forms via Sheet; use `GET /forms/latest`.
- `shared`: contratos Pydantic, adaptadores AWS/external APIs, segurança e logs.
- `infrastructure`: Terraform e CDK inicializáveis por ambiente.
- `dmc-workspace`: protótipo interativo frontend (Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, AI Elements) do workspace do consultor/curador de viagens da BLU Costa Travel.

## Workspace UI Prototype (DMC Travel Designer)

Para testar o fluxo de experiência de utilizador (*Intake do Briefing → Curadoria Simulada → Itinerário Interativo → Copiloto AI com Destaques Visuais*):

```bash
cd dmc-workspace
npm install
npm run dev -- -p 3001
```

Aceda a **[http://localhost:3001](http://localhost:3001)**. Consulte o guia detalhado em **[README_UIMOCK.md](README_UIMOCK.md)**.


## Qualidade e entrega

```bash
make test
make lint
locust -f tests/load_itineraries.py --host http://localhost:8000
terraform -chdir=infrastructure/terraform init
terraform -chdir=infrastructure/terraform plan
```

O workflow GitHub Actions corre lint, testes e validação Terraform. Nunca coloque chaves no repositório: use `.env` apenas localmente e Secrets Manager em produção. Consulte [arquitetura](docs/architecture.md), [API](docs/api.md), [ETL](docs/etl.md), [curadoria/DNA](docs/curation.md), [operações](docs/operations.md) e [modelo ER](docs/er-diagram.md).

## Próximos passos de produção

Criar imagens por serviço, adicionar redes privadas/NAT/Aurora e tarefas ECS por ambiente, configurar Secrets Manager/WAF/observabilidade e preencher os adaptadores contratuais de Places, TripAdvisor, Uber, Bolt e CRM com as APIs e permissões contratadas.

## Google Forms / Google Sheets

Ative a Google Sheets API, crie uma service account de leitura e partilhe a Sheet de respostas com o email dessa conta. Guarde o JSON de credenciais fora do Git (por exemplo, AWS Secrets Manager montado como ficheiro em ECS/Lambda) e configure `BLU_GOOGLE_SHEET_ID`, `BLU_GOOGLE_SHEET_RANGE` e `BLU_GOOGLE_SERVICE_ACCOUNT_FILE`. Cada chamada de `GET /forms/latest` faz uma chamada nova à API Google e encaminha os registos por `process_form_responses`; não existe cache de respostas.

