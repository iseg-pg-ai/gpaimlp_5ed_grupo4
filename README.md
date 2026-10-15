# BLU AI System

Projeto do Grupo 4 da 5.ª edição da Pós-Graduação em Artificial Intelligence &
Machine Learning do ISEG.

O sistema transforma fontes locais num warehouse auditável e usa esse catálogo
para criar, rever, versionar e exportar propostas de itinerário no DMC Workspace.

## Componentes

- `data/`: fontes locais que representam o futuro bucket de entrada.
- `etl/`: ingestão, validação e publicação do warehouse.
- `warehouse/`: artefactos gerados consumidos pelo dashboard e pelo portal.
- `dashboard/`: dashboard analítico Streamlit.
- `dmc-workspace/`: portal operacional Next.js para briefing, catálogo e propostas.
- `translations/`: tradução local dos conteúdos exportados.
- `exports/itineraries/`: histórico local de versões e PDFs, fora do Git.

## Requisitos

- Python 3.12 ou 3.13.
- Node.js 24 LTS.
- PowerShell para os scripts de automação fornecidos.

## Instalação

Na raiz do repositório:

```powershell
python -m pip install uv==0.12.19
python -m uv sync --locked --group translation
python translations/setup_models.py
```

O `pyproject.toml` é a fonte das dependências Python. O `uv.lock`, o
`requirements.txt` e o `translations/requirements.txt` fixam ou exportam essas
dependências e não devem ser alterados manualmente.

Para instalar por `pip`:

```powershell
python -m pip install -r requirements.txt
python -m pip install --no-deps -r translations/requirements.txt
```

Preferir `uv sync --locked` para respeitar os overrides de segurança.
O export de tradução inclui todas as dependências resolvidas e exige `--no-deps`:
Argos Translate 1.11.0 ainda fixa Stanza 1.10.1, substituído neste projeto por
Stanza 1.12.2 para corrigir GHSA-v5jw-96jm-7h2c. Sem essa opção, o resolver do
`pip` rejeita o requisito antigo do Argos. Reavaliar o override quando o Argos
publicar uma versão com Stanza corrigido.

## Arranque rápido

### Atualizar o warehouse

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

### Iniciar o Agente de IA (LangChain / Bedrock)

Na raiz do repositório:

- No macOS/Linux: `bash scripts/start_ai_agent.sh`
- No Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\start_ai_agent.ps1`

O serviço inicia na porta 8000 (`http://localhost:8000/docs`).

### Iniciar o DMC Workspace

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001). O portal comunica automaticamente com o Agente de IA na porta 8000 quando disponível.

No SageMaker Code Editor, definir a origem pública antes de iniciar. O comando
`dev` usa automaticamente o adaptador que repõe o prefixo removido pelo proxy:

```bash
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws npm run dev -- -p 3001
```

Abrir a porta 3001 pelo Code Editor. Para o arranque de produção, consultar
[o guia do DMC Workspace](dmc-workspace/README.md).

### Iniciar o dashboard analítico

Na raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Abrir [http://localhost:8501](http://localhost:8501).

## Testes

Verificar a estrutura e as ligações locais, sem instalar dependências:

```bash
python scripts/check_project.py
```

```powershell
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -v
cd dmc-workspace
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes de navegador exigem o portal iniciado na porta 3001. No Windows pode
ser necessário definir `BROWSER_CHANNEL=msedge` antes de executar os scripts.
O agregador `npm run check` executa também `format:check`; consulte o
[estado das funcionalidades](docs/ARCHITECTURE.md) para a situação atual dessa verificação.

## Documentação

- [Arquitetura e âmbito](docs/ARCHITECTURE.md)
- [DMC Workspace](docs/PORTAL.md)
- [ETL e contrato dos dados](docs/DATA_PIPELINE.md)
- [Testes e histórico de validação](docs/TESTING.md)
- [Decisões do projeto](docs/DECISIONS.md)
- [Modelo analítico do warehouse](reports/data_model_report.md)

## Limites atuais

O portal não efetua reservas nem confirma automaticamente preços,
disponibilidade, acessibilidade ou condições alimentares. O catálogo aprovado e
as regras estruturadas orientam a proposta; dados ambíguos ficam por confirmar.
O armazenamento é local e não inclui autenticação ou sincronização entre
utilizadores. Consulte [o estado detalhado](docs/ARCHITECTURE.md) antes de planear novas
alterações.
