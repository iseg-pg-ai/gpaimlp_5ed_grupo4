# Testes de conformidade e regressão

Este documento descreve como validar o checkout atual. Resultados de execuções antigas não são garantia do estado presente; o Git conserva a evolução e [Decisões](DECISIONS.md) explica as escolhas e os seus limites.

## Preparação

Para a bateria Python completa:

```bash
uv sync --locked --all-groups
```

O grupo `agent` é necessário para os testes do planeador e do adaptador Bedrock; não inicia um serviço HTTP. O grupo `translation` é necessário para `translations.test_worker`. Os testes devem usar diretórios temporários, mocks para fornecedores externos e nunca alterar o catálogo, warehouse ou exports operacionais.

Manter regressões de comportamentos atuais. Evitar testes que apenas procurem trechos no código ou inspecionem outros testes quando já exista validação da saída real. O contrato Prompt TXT é verificado em `tests/test_portal_data.py` e `dmc-workspace/tests/itinerary-prompt.test.mjs`; o link público da apresentação é verificado em `presentation/test-browser.mjs`.

## Estrutura e documentação

Na raiz:

```bash
python scripts/check_project.py
npx --yes markdownlint-cli2@0.19.0
git diff --check
```

`check_project.py` valida a estrutura, ficheiros obrigatórios e ligações Markdown locais. O workflow `documentation.yml` executa as duas primeiras verificações quando a documentação muda.

## Python, ETL e Monitoring

Na raiz, com o ambiente preparado:

```bash
PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
.venv/bin/python -B -m unittest monitoring.test_monitoring monitoring.test_checkpoint monitoring.test_operations -v
.venv/bin/python -B -m unittest translations.test_worker -v
```

No Windows, usar `.venv\Scripts\python.exe` e definir `PYTHONPATH` de forma equivalente. Quando o catálogo ou a integração com o ETL mudarem, executar também:

```bash
cd dmc-workspace
npm run test:catalog-etl
```

`tests/test_etl_pipeline.py` reúne a integração com Excel/PDF sintéticos e os cenários de publicação/rollback. Não depende de uma quantidade fixa de PDFs ou regras numa entrega privada. `tests/test_local_source.py` cobre a descoberta e o inventário das fontes.

O workflow `data-pipeline.yml` cobre dependências exportadas, ETL, o gate versionado de qualidade e compatibilidade e uma seleção dos testes Python. A entrega sintética de diagnóstico é conservada durante 14 dias; não é uma release operacional nem contém fontes reais.

## Portal

Em `dmc-workspace/`:

```bash
npm run check
npm run build
```

As validações do exemplo de briefing e do preenchimento/preço do catálogo estão consolidadas em `tests/validation.test.mjs`, preservando os cenários individuais.
As suites de persistência, concorrência e fronteiras cliente/servidor mantêm-se separadas por responsabilidade.

Se não existir warehouse local, preparar a fixture sintética do CI num diretório temporário antes do `check`, sem materializar dados operacionais:

```bash
# Na raiz do repositório; manter a variável neste terminal.
BLU_TEST_ROOT="$(mktemp -d /tmp/blu-validation.XXXXXX)"
.venv/bin/python scripts/create_ci_etl_fixture.py --output "$BLU_TEST_ROOT/data"
.venv/bin/python -B -m etl.pipeline \
  --data-dir "$BLU_TEST_ROOT/data" --output-dir "$BLU_TEST_ROOT/warehouse"
export BLU_WAREHOUSE_DIR="$BLU_TEST_ROOT/warehouse"
```

Voltar a `dmc-workspace/` para executar `npm run check` e `npm run build` no mesmo terminal. O teste de importação de catálogo e os testes de curadoria precisam destes ficheiros; a sua ausência não deve ser resolvida criando dados em `warehouse/` dentro do checkout.

`check` executa lint, TypeScript, formatação e testes Node. O build confirma a compilação de produção. O workflow `portal.yml` executa ambos e acrescenta o ensaio isolado catálogo aprovado → ETL → geração → confirmação → versão → PDF.
Usa fontes sintéticas e diretórios temporários, sem catálogo ou exports reais.
Os testes Node incluem dois processos independentes a disputar a mesma revisão-base do catálogo e das versões: exatamente um escritor é aceite e o outro recebe conflito, sem revisão duplicada. Isto valida uma única instância SQLite partilhada; não demonstra concorrência entre máquinas nem sincronização de rascunhos guardados no navegador.

## Infraestrutura

Em `infra/`, executar `npm test` depois de construir o frontend. A suite `tests/frontend.test.mjs` partilha a síntese válida da aplicação para verificar cache dos sites, limites da API e confiança IAM do Backoffice. Os controlos são feitos sobre o CloudFormation gerado; não constituem deployment ou validação AWS.

## Testes de navegador

Os cenários de navegador exigem um Portal de testes iniciado, por omissão na porta 3001. Não os executar contra dados operacionais. Preparar o browser do Playwright quando necessário:

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

Usar `PORTAL_URL` para outra origem, incluindo o basePath do build quando existir.
Num servidor sintético fora do proxy real, definir `PORTAL_PUBLIC_ORIGIN` para a origem local efetivamente usada no navegador; não relaxar a proteção de origem para fazer passar os formulários. Builds com e sem prefixo são distintos. Cenários que escrevem versões, catálogo ou entregas devem arrancar o portal com `BLU_DATA_DIR`, `BLU_WAREHOUSE_DIR` e `BLU_EXPORT_DIR` apontados para cópias temporárias. Tradução, meteorologia, percursos, Bedrock e outros fornecedores externos são simulados por defeito.

A apresentação e o Monitoring têm cenários próprios:

```bash
node presentation/test-browser.mjs
node monitoring/test-browser.mjs
```

A apresentação deve estar na porta 3003. O teste do Monitoring cria servidor, credenciais e runtime temporários; não usa contas reais.

## O que os testes não demonstram

- Mocks não comprovam disponibilidade, custo ou qualidade dos fornecedores reais.
- Um HTTP 200 não prova que a curadoria completa ou o acesso Bedrock funcionam.
- Testes locais não validam proxy, sessão, DNS, TLS ou regras de rede da AWS.
- A estrutura de um PDF não substitui a inspeção visual nos idiomas suportados.
- A aprovação de um build não confirma a configuração administrativa dos buckets, alertas externos ou recuperação de uma máquina completa.

Registar em [DECISIONS.md](DECISIONS.md) a fundamentação e os limites de decisões duráveis, com referências ao código e verificações relevantes. Logs e contagens transitórias pertencem à execução ou à revisão avaliada, não a um diário nesse guia.

## Auditoria das dependências Python

Auditar o export base não cobre os grupos opcionais. Para avaliar todos os grupos sem alterar o ambiente do projeto nem os exports versionados:

```bash
uv export --locked --all-groups --no-hashes --no-emit-project \
  --format requirements-txt --output-file /tmp/blu-audit-all-groups.txt
uv tool run --from pip-audit pip-audit --disable-pip --no-deps \
  --requirement /tmp/blu-audit-all-groups.txt --format json \
  --output /tmp/blu-audit-all-groups.json
```

Esta consulta requer rede. Inspecionar também os pacotes omitidos no JSON: a ausência de vulnerabilidades reportadas não cobre dependências que a ferramenta não conseguiu analisar. Variantes distribuídas fora do PyPI podem ser omitidas. Complementar a consulta com a versão e a origem exatas, registando a base de avisos e os limites; isso não atesta os bytes do wheel instalado.
Não substituir a variante CPU nem alterar o lockfile apenas para obter um resultado sem omissões. Para regenerar requirements versionados, manter o fluxo `scripts/export_requirements.py`.
