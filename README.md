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
python -m uv sync --locked
```

A instalação base contém apenas o necessário ao ETL. Instalar os componentes
opcionais quando forem usados, preservando os outros grupos já instalados:

```bash
uv sync --locked --inexact --group dashboard
uv sync --locked --inexact --group agent
uv sync --locked --inexact --group translation
```

Para tradução, executar também `python translations/setup_models.py`.
Para desenvolvimento com todos os componentes: `uv sync --locked --all-groups`.
O portal tem dependências próprias em `dmc-workspace/`.

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

### Recuperar e iniciar todo o sistema

No Linux/SageMaker, instalar uma vez o launcher local:

```bash
bash scripts/install_just_blu_it.sh
```

Depois, a partir de qualquer diretório dentro do repositório:

```bash
just blu it
```

O comando pede interativamente o utilizador e a palavra-passe do monitoring. Apenas
uma conta ativa com perfil `admin` pode iniciar a recuperação; a palavra-passe não
aparece no terminal nem é aceite por argumento, variável de ambiente ou entrada não
interativa.

O comando valida Python e Node, sincroniza dependências bloqueadas, preserva dados
válidos ou recupera conjuntos ausentes a partir do último backup verificado, executa
as baterias de testes, constrói o portal, inicia os cinco serviços e confirma as
portas 3001, 3003, 3004, 8000 e 8501. O terminal mostra uma barra por tarefa e guarda
detalhes em `monitoring/runtime/recovery/just-blu-it.log`.

Em Code Editor, `.vscode/settings.json` pede o encaminhamento automático destas
portas. O comando não consegue renovar uma sessão SageMaker expirada: a autenticação
externa continua a ser aberta pela consola AWS.

### Atualizar o warehouse

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

### Iniciar o Agente de IA (LangChain / Bedrock)

Na raiz do repositório:

Instalar primeiro o grupo opcional `agent` indicado acima.

- No macOS/Linux: `bash scripts/start_ai_agent.sh`
- No Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\start_ai_agent.ps1`

O serviço inicia na porta 8000 (`http://localhost:8000/docs`).

### Iniciar o DMC Workspace

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

O catálogo, a consulta das fontes, a meteorologia e o TXT/Canva usam Python
3.12 ou 3.13 local, sem bibliotecas adicionais. O portal usa `BLU_PYTHON`, `.venv`
ou o Python do sistema. O agente continua opcional. O explorador em `/references` usa um
formulário HTML: selecionar a folha e carregar em **Filtrar**.

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

Instalar primeiro o grupo opcional `dashboard` indicado acima.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Abrir [http://localhost:8501](http://localhost:8501).

## Testes

Os testes completos de Python exigem o grupo `agent`; os de tradução exigem
`translation`. Para preparar ambos: `uv sync --locked --inexact --group agent --group translation`.

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
