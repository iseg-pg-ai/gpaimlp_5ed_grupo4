# Testes de conformidade e regressão

Este documento descreve como validar o checkout atual. Resultados de execuções
antigas não são garantia do estado presente; o histórico permanece no Git e em
[decisões](DECISIONS.md).

## Preparação

Para a bateria Python completa:

```bash
uv sync --locked --all-groups
```

O grupo `agent` é necessário para os testes do planeador e do adaptador
Bedrock; não inicia um serviço HTTP. O grupo `translation` é necessário para
`translations.test_worker`. Os testes devem usar diretórios
temporários, mocks para fornecedores externos e nunca alterar o catálogo,
warehouse ou exports operacionais.

## Estrutura e documentação

Na raiz:

```bash
python scripts/check_project.py
npx --yes markdownlint-cli2@0.19.0
git diff --check
```

`check_project.py` valida a estrutura, ficheiros obrigatórios e ligações Markdown
locais. O workflow `documentation.yml` executa as duas primeiras verificações
quando a documentação muda.

## Python, ETL e Monitoring

Na raiz, com o ambiente preparado:

```bash
PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
.venv/bin/python -B -m unittest monitoring.test_monitoring -v
.venv/bin/python -B -m unittest translations.test_worker -v
```

No Windows, usar `.venv\Scripts\python.exe` e definir `PYTHONPATH` de forma
equivalente. Quando o catálogo ou a integração com o ETL mudarem, executar também:

```bash
cd dmc-workspace
npm run test:catalog-etl
```

O workflow `data-pipeline.yml` cobre dependências exportadas, ETL, o gate
versionado de qualidade e compatibilidade e uma seleção dos testes Python. A
entrega sintética de diagnóstico é conservada durante 14 dias; não é uma release
operacional nem contém fontes reais.

## Portal

Em `dmc-workspace/`:

```bash
npm run check
npm run build
```

`check` executa lint, TypeScript, formatação e testes Node. O build confirma a
compilação de produção. O workflow `portal.yml` executa ambos e acrescenta o
ensaio isolado catálogo aprovado → ETL → geração → confirmação → versão → PDF.
Usa fontes sintéticas e diretórios temporários, sem catálogo ou exports reais.
Os testes Node incluem dois processos independentes a disputar a mesma
revisão-base do catálogo e das versões: exatamente um escritor é aceite e o
outro recebe conflito, sem revisão duplicada. Isto valida uma única instância
SQLite partilhada; não demonstra concorrência entre máquinas nem sincronização
de rascunhos guardados no navegador.

## Testes de navegador

Os cenários de navegador exigem o portal iniciado na porta 3001. Preparar o
browser do Playwright quando necessário:

```bash
cd dmc-workspace
npx playwright install chromium
npm run dev -- -p 3001
```

Noutro terminal, executar a bateria aplicável:

```bash
npm run test:ui
npm run test:catalog
npm run test:observatory
npm run test:confirmations
npm run test:itinerary
npm run test:trash
npm run test:delivery
npm run test:theme
npm run test:compliance
```

`test:ui` cobre responsividade e navegação nos seis idiomas; os aliases
`test:responsive` e `test:navigation` permitem selecionar apenas uma parte.
`STRESS=1` ativa o cenário de conteúdo longo. No Windows, definir
`BROWSER_CHANNEL=msedge` quando se pretender usar o Edge instalado.

Usar `PORTAL_URL` para outra origem. Cenários que escrevem versões, catálogo ou
entregas devem arrancar o portal com `BLU_DATA_DIR`, `BLU_WAREHOUSE_DIR` e
`BLU_EXPORT_DIR` apontados para cópias temporárias. Tradução, meteorologia,
percursos, Bedrock e outros fornecedores externos são simulados por defeito.

A apresentação e o Monitoring têm cenários próprios:

```bash
node presentation/test-browser.mjs
node monitoring/test-browser.mjs
```

A apresentação deve estar na porta 3003. O teste do Monitoring cria servidor,
credenciais e runtime temporários; não usa contas reais.

## O que os testes não demonstram

- Mocks não comprovam disponibilidade, custo ou qualidade dos fornecedores reais.
- Um HTTP 200 não prova que a curadoria completa ou o acesso Bedrock funcionam.
- Testes locais não validam proxy, sessão, DNS, TLS ou regras de rede da AWS.
- A estrutura de um PDF não substitui a inspeção visual nos idiomas suportados.
- A aprovação de um build não confirma a configuração administrativa dos buckets,
  alertas externos ou recuperação de uma máquina completa.

Registar em [DECISIONS.md](DECISIONS.md) apenas resultados que condicionem uma
decisão durável. Resultados transitórios pertencem ao log da execução ou à revisão
de código, evitando acumular contagens desatualizadas neste guia.
