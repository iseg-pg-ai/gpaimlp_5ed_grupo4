# BLU AI System

Pipeline local para ingestão, validação, análise e visualização dos dados BLU.

## Arranque rápido

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

Depois, inicie o dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Abra `http://localhost:8501`.

## Componentes

- `etl/`: extração de Excel/PDF, transformação, validação, KPIs e modelos analíticos explicáveis.
- `data/`: fontes de entrada — um workbook e propostas PDF.
- `warehouse/`: saída regenerada com JSONL, SQLite, validação, KPIs e modelos.
- `dashboard/`: dashboard Streamlit sobre o warehouse.
- `reports/`: documentação do modelo de dados.
- `scripts/`: automação de execução e arranque do dashboard.

## Credenciais

Não são necessárias credenciais, `.env`, Docker, AWS, Google Sheets ou APIs externas para correr o pipeline e o dashboard locais. É necessário apenas Python com `pip` e acesso à internet na primeira instalação das dependências.

## Documentação

- [Automação e operações](AUTOMATION.md)
- [ETL e saídas](README_ETL.md)
- [Modelo de dados](reports/data_model_report.md)

## Nota sobre as instruções antigas

As instruções que usavam `cp .env.example .env`, `docker compose`, `pip install -e ".[dev]"` e `uvicorn` pertenciam a uma versão anterior do projeto. Os respetivos ficheiros (`.env.example`, `docker-compose.yaml`, `pyproject.toml` e `services/`) não existem neste checkout, pelo que esses comandos não devem ser usados.
