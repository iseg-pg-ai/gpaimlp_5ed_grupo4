# BLU AI System

Sistema de curadoria de viagens: transforma fontes locais num warehouse auditável
e permite criar, rever, versionar e exportar itinerários no portal operacional.

## Componentes

- `data/`: fontes Excel/PDF e catálogo operacional, preservando a proveniência.
- `etl/`: ingestão, validação e publicação do warehouse com rollback.
- `warehouse/`: entrega gerada pelo ETL; não editar manualmente.
- `dashboard/`: observatório analítico Streamlit, de leitura.
- `dmc-workspace/`: portal Next.js para briefing, catálogo, itinerários e exportações.
- `src/blu_ai/`: agente legado opcional; o novo fluxo transacional está em preparação.
- `translations/`: tradução local dos conteúdos exportados.
- `exports/itineraries/`: versões e PDFs operacionais, fora do Git.

## Preparar o ambiente

Usar Python 3.12 ou 3.13, Node.js >=22.13 e <25 (preferindo 24 LTS) e uv instalado.
Os manifests e lockfiles são as fontes de dependências; não alterar os exports pip à mão.

Na raiz do projeto, preparar apenas a base ETL:

```powershell
uv sync --locked --python 3.12
```

Os grupos opcionais atuais são `dashboard`, `agent` e `translation`.
Para desenvolver e verificar o conjunto:

```powershell
uv sync --locked --all-groups --python 3.12
```

`uv sync` pode remover grupos não selecionados; usar todos os grupos necessários
ou `--inexact` quando se pretende conservar os pacotes adicionais já instalados.
Não existem grupos `dev` ou `sagemaker` neste checkout.

A tradução exige também os modelos locais, preparados separadamente por
`translations/setup_models.py`. Antes de instalar, consultar a
[exceção de compatibilidade Argos/Stanza](docs/DEPENDABOT_PYTHON.md).
Os testes com mocks não demonstram que os modelos estejam instalados.

Alternativa pip para a base e o grafo de tradução exportado:

```powershell
python -m pip install -r requirements.txt
python -m pip install --no-deps -r translations/requirements.txt
```

Preferir uv para respeitar o override Stanza. Ao manter dependências, o script
`scripts/export_requirements.py` exige que o interpretador usado tenha o módulo
`uv` instalado; suporta `--check` para detetar exports desatualizados.

## Dados e arranque

O percurso é `data/` → ETL → `warehouse/` → observatório e portal. A publicação
valida a entrega antes de substituir o destino e preserva rollback. Executar
apenas quando se pretende atualizar o warehouse:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

Nos testes usar fontes copiadas e destinos temporários separados, nunca a
entrega operacional. Consultar [dados e operações](docs/DATA_PIPELINE.md).

Para iniciar o portal:

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001). O Python do portal pode ser
indicado por `BLU_PYTHON`; a tradução usa `BLU_TRANSLATION_PYTHON`.
As versões e PDFs usam `BLU_EXPORT_DIR` ou `exports/itineraries/` por defeito.
O [guia do portal](dmc-workspace/README.md) descreve SageMaker, proxy e fontes CJK.

O dashboard analítico pode ser iniciado, com o grupo `dashboard` instalado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

O agente legado é opcional. O seu código existente não comprova a implementação
do fluxo proposta → pré-visualização → aceitação → versão. Confirmar o
[estado da arquitetura](docs/ARCHITECTURE.md) e o [plano](PLAN.md).

## Verificações

Na raiz, usando a `.venv` preparada:

```powershell
.\.venv\Scripts\python.exe -B scripts/check_project.py
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -B -m unittest translations.test_worker -v
```

No portal:

```powershell
cd dmc-workspace
npm run check
npm run build
npm run test:catalog-etl
```

Nos outros sistemas usar o executável equivalente em `.venv/bin/python`.
Os testes de navegador exigem o portal e configuração próprios. PDF real,
tradução real e acesso SageMaker/Bedrock são verificações separadas dos mocks.
Ver [testes e limitações](docs/TESTING.md).

## Documentação e limites

- [Como trabalhar neste projeto](AIREADME.md).
- [Arquitetura e âmbito](docs/ARCHITECTURE.md).
- [Portal operacional](docs/PORTAL.md).
- [Dados e operações](docs/DATA_PIPELINE.md).
- [Decisões](docs/DECISIONS.md).
- [Plano de evolução](PLAN.md).

O portal não confirma automaticamente disponibilidade, reservas, preços finais,
acessibilidade ou condições alimentares. Propostas e pendências exigem revisão
humana. Preservar fontes, histórico, atividades protegidas e credenciais.

## Assistente de itinerário — Fase 2

O fluxo de propostas com aceitação explícita, configuração privada e limites
está em [docs/ASSISTANT.md](docs/ASSISTANT.md). A exportação TXT mantém o
contrato atual para o Canva. Testes com fornecedor simulado não substituem
a avaliação real aprovada numa fase posterior.
