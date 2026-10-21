# Decisões e questões abertas

Os registos históricos conservam as datas e a evidência original. O mapa atual
está em [arquitetura](ARCHITECTURE.md); as tarefas em [PLAN.md](../PLAN.md).

## Inicialização segura de um checkout sem estado operacional — 2026-10-20

- Um checkout sem catálogo, itinerários ou backups é tratado como instalação nova.
- `just blu it` cria atomicamente `data/portal/catalog.sqlite` a partir do warehouse
  versionado e importa os registos com estado **Em revisão**; cria também
  `exports/itineraries/` vazio.
- A presença de estado parcial ou inválido impede o bootstrap e mantém a exigência
  de um backup verificado, evitando substituir dados operacionais por engano.
- Evidência: `monitoring/recovery.py` e `monitoring/test_operations.py`.

## Cálculo rodoviário centralizado em Python — 2026-10-20

- Consulta OSRM, validação dos parâmetros e fallback geométrico passam de
  `src/lib/road-routing.ts` para `portal/routing.py`.
- O adaptador TypeScript preserva o contrato assíncrono usado pelas APIs e pelo
  editor. A ordenação interativa e os resumos permanecem temporariamente no
  cliente até a próxima fatia da migração.
- O fornecedor externo é substituível nos testes Python; falhas de rede continuam
  a produzir estimativas identificadas como não otimizadas.
- Evidência: `tests/test_routing.py` e `dmc-workspace/tests/road-routing.test.mjs`.

## Simplificação para a próxima iteração do agente — 2026-10-15

### Consolidação dos testes

- Navegação e responsividade passam a `tests/browser/ui.mjs`; os comandos antigos
  continuam como aliases para selecionar apenas um grupo.
- Configuração AWS, URLs públicas e compatibilidade ESLint passam a
  `tests/infrastructure.test.mjs`, preservando os quatro testes originais.
- O helper de navegador centraliza apenas arranque, leitura nova da fixture e
  mock de tradução. Cada cenário mantém o seu contexto e mocks específicos.
- As asserções e condições de falha foram preservadas por comparação automática.
- Validação: 99 testes unitários aprovados, um ignorado; build aprovado;
  42 cenários de interface, stress, dois de briefing e apresentação aprovados.
- Total versionado: 303 ficheiros. Não foi removida cobertura funcional.

### Revisão integral posterior do diretório

- Inventariar recursivamente ficheiros e pastas, sem seguir montagens ou ler
  credenciais do ambiente. Conservar ferramentas do IDE e dados operacionais.
- Eliminar o CSV do processamento antigo, o notebook experimental sem execução,
  o esquema Python sem consumidores e o lockfile npm vazio da raiz.
- Retirar `user-default-efs` do Git mantendo a montagem física na instância.
- Remover os grupos de experiências SageMaker/MLflow e ferramentas dev sem uso.
  Declarar LangGraph diretamente e retirar LangChain/Community sem consumidores.
- Instalação base limitada ao ETL; dashboard, agente e tradução são opcionais.
  Os scripts indicam como instalar cada grupo quando faltar uma dependência.
- Resultado: lockfile com 148 entradas em vez de 221; instalação base com nove
  pacotes. Os 147 pacotes de registry passaram a auditoria sem vulnerabilidades
  conhecidas. Restam 309 ficheiros versionados, incluindo fontes e warehouse.
- Validação: 18 testes do ETL numa instalação mínima limpa; 21 testes Python,
  cinco de tradução e 99 testes do portal no ambiente completo; um teste ignorado.
- A fábrica do agente foi exercitada com um modelo simulado sem chamadas externas.
  A API ReAct atual mantém LangGraph na série 1.x até à próxima iteração.

### Fusão dos auxiliares HTTP e de formulário

- Estado: implementado em chore/project-cleanup, em commit próprio.
- `http-client.ts` reúne caminhos do portal, fetch e leitura de respostas.
- `server-http.ts` reúne URLs públicas e respostas das APIs, usado apenas no servidor.
- `ui/form-controls.tsx` reúne Input, Textarea e estilo de select, preservando refs,
  propriedades e classes. Todos os consumidores usam os novos caminhos.
- Sete ficheiros passam a três; total versionado reduzido de 309 para 305.
- Validação: lint, tipos, formatação e build aprovados; 99 testes passaram e um
  ficou ignorado. Não foram modificados os contratos de curadoria ou persistência.

### Primeira etapa de consolidação

- Estado: limpeza e consolidação locais no branch chore/project-cleanup.
- Base: dev em `a4b7626`; inventário inicial de 345 ficheiros versionados.
- Remover experiências de planeamento/distâncias sem consumidores, recursos do
  template e placeholders redundantes. Os ficheiros pessoais do shell saem do
  Git e permanecem no disco, ignorados.
- Concentrar arquitetura e capacidades, dados e operações, decisões e validação.
  Preservar o histórico datado e usar o Git para versões anteriores dos planos.
- Manter uma única cópia do prompt no pacote autocontido do plugin. Os erros
  de tradução passam a ser exportados pelo módulo do worker que os produz.
- Todos os módulos do portal eram alcançáveis pelas entradas de produção.
  Manter as fronteiras de domínio; não fundir funcionalidades independentes.
- Resultado: 314 ficheiros versionados; documentação Markdown de 29 para 20.
- Verificação: 99 testes do portal aprovados e um ignorado; build aprovado;
  20 testes Python e cinco de tradução aprovados; Markdown e links sem erros.
- Acrescentar verificação de artefactos locais e ligações ao CI documental.
  Não alterar fontes, warehouse, catálogo operacional ou versões dos clientes.

## Dependências Python corrigidas — 2026-10-15

- Estado: implementado e validado localmente em fix/dependabot-python.
- Base: origin/dev em `f0d4476`; oito pacotes atualizados pelos alertas Dependabot.
- Preservar SageMaker 2.x e protobuf 6.x; impor mínimos corrigidos no pyproject.
- Argos 1.11.0 fixa Stanza vulnerável. Usar override Stanza 1.12.2 e instalar
  o export completo de tradução com pip `--no-deps`, ou preferir uv.
- Evidência: 20 testes Python e cinco de tradução aprovados; auditoria dos
  220 pacotes de registry do lockfile sem vulnerabilidades conhecidas.
- Sem modelos de tradução locais ou validação de serviços AWS reais.
  Detalhes em [docs/DEPENDABOT_PYTHON.md](DEPENDABOT_PYTHON.md).

## Integração de dev em plugin_TXT_export — 2026-10-15

- Estado: conflitos documentais resolvidos; integração local validada.
- Base: origin/dev em `e62398e`; branch inicial em `d890740`.
- Causa: PLAN.md e memory/decisions.md foram adicionados independentemente,
  produzindo conflitos add/add. Preservar os conteúdos de ambos os branches.
- O código integrou-se automaticamente, mantendo TXT/Canva e o arranque SageMaker.
- Evidência: check passou com 99 testes aprovados e um ignorado; build passou;
  sintaxe Bash e verificação do diff passaram. Sem publicação remota.

O bloco seguinte foi importado da revisão de 8 de outubro de 2026. Conserva o
contexto dessa data; decisões posteriores no mesmo ficheiro prevalecem quando o
estado mudou.

## D-001 - Distinguir implementação e arquitetura futura

- Estado: parcialmente substituído por decisões posteriores; revisão original em
  2026-10-08, com data inicial de 2026-09-29.
- Decisão original: ETL, warehouse, Streamlit e DMC Workspace eram a base
  implementada. O agente Bedrock e a execução no SageMaker foram acrescentados
  depois como capacidades opcionais; deployment de produção continua futuro.
- Razão: diagramas e experiências não demonstram integração funcional.
- Evidência: etl/pipeline.py, dashboard/app.py e APIs do portal; scripts experimentais.
- Âmbito: arquitetura e planeamento.

## D-002 - Proteger fontes e publicar pelo ETL

- Estado: estabelecido; atualizado em 2026-10-08; data original: 2026-09-29.
- Decisão: Excel/PDF e suplementos são protegidos. O editor escreve na fonte
  operacional data/portal/catalog.sqlite. O ETL lê ambas e publica o warehouse.
- Razão: manutenção com linhagem e entrega validada.
- Evidência local: catalog-store.ts, etl/portal_catalog.py, etl/pipeline.py.
- Âmbito: dados, catálogo e consumidores.

## D-003 - Manter overrides fora dos ficheiros brutos

- Estado: estabelecido; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: overrides revistos ficam em config/curation_rule_overrides.json.
- Razão: regras auditáveis sem alterar fontes originais.
- Evidência: etl/pipeline.py e API itineraries.
- Âmbito: curadoria.

## D-004 - Manter revisão e confirmação humanas

- Estado: aceite; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: geração/comandos produzem propostas; curador regista confirmações e
  evidências. Guardar/exportar não equivale a reservar.
- Razão: preços, horários e acessibilidade podem estar por confirmar.
- Evidência local: activity-confirmation.ts, ActivityConfirmationEditor.tsx,
  docs/PORTAL.md.
- Âmbito: interface, assistente e entrega.

## D-005 - Usar branches por alteração coerente

- Estado: decisão de equipa preservada; destino dos próximos PRs a confirmar.
- Data original: 2026-09-29; revisão: 2026-10-08.
- Decisão: branches curtos e PRs revistos. Política registada usa dev;
  main é a referência funcional desta revisão.
- Razão: preservar revisão sem inventar uma alteração de política.
- Evidência: instrução de equipa registada anteriormente;
  AGENTS.md.
- Âmbito: desenvolvimento Git.

## D-006 - Concentrar operação no DMC Workspace

- Estado: aceite e implementado; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: briefing, catálogo, proposta, confirmação e exportação no Next.js;
  Streamlit para análise. Google Forms fora do âmbito.
- Razão: fluxo operacional único.
- Evidência: NewTripScreen.tsx, página principal, dashboard/app.py e README.md.
- Âmbito: produto e interfaces.

## D-007 - Gerar com oferta aprovada e publicada

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: draft/review/approved/inactive mantêm revisões e histórico. Apenas
  oferta aprovada e compatível com revisão publicada pode ser elegível.
- Razão: impedir seleção de registos editados/inativos desatualizados.
- Evidência local: catalog-store.ts (isPublished), published-catalog.ts,
  etl/portal_catalog.py.
- Âmbito: catálogo, geração e consistência.

## D-008 - Preservar versões e bytes históricos

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: rascunhos no navegador; versões autoritativas em
  exports/itineraries/history.sqlite, com snapshots, hashes e PDFs persistidos.
  Variantes linguísticas pertencem à mesma versão.
- Razão: auditoria, concorrência e reexportação estável.
- Evidência: version-store.ts, localized-pdf.ts, API versions.
- Âmbito: persistência, backup e exportação.

## D-009 - Explicitar incertezas financeiras e de horários

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: separar valores desconhecidos, moedas, custos calculáveis e orçamento
  disponível. Horários propostos/deslocações são estimativas.
- Razão: evitar zero implícito e falsas confirmações.
- Evidência local: proposal-budget.ts, budget-pdf.ts, itinerary-scheduling.ts.
- Âmbito: geração, interface e PDF.

## D-010 - Assistente determinístico e tradução local

- Estado: estabelecido pela implementação; data da revisão: 2026-10-08.
- Decisão: comandos validados respeitam proteções e não constituem integração LLM.
  Tradução opcional usa subprocesso Python/modelos locais, separando UI e itinerário.
- Razão: explicabilidade e controlo local.
- Evidência local: assistant-editing.ts; local-translation.ts, translations/worker.py.
- Âmbito: assistente e idiomas.

Módulos TypeScript sem prefixo pertencem a dmc-workspace/src/lib/ e componentes
a dmc-workspace/src/components/.

## D-011 - Gerir o prompt de curadoria e exportar plugin de instruções

- Estado: interpretação inicial substituída por D-012; prompt genérico preservado.
- Data: 2026-10-08; definição inicial na conversa de 2026-10-06.
- Decisão: configuração no DMC para editar/guardar/exportar TXT e plugin novo
  blu-curadoria apenas com instruções. Ambos exportam a mesma revisão guardada.
- Razão: reutilizar orientação de curadoria sem introduzir chamadas a modelos.
- Evidência: escolhas explícitas do utilizador, plugins/blu-curadoria/skills/curadoria-blu/references/curadoria-blu.txt
  e plugins/blu-curadoria/.
- Âmbito: funcionalidade futura em branch/worktree separado de main; nenhuma
  integração LLM, ligação aos dados ou instalação automática nesta entrega.

## D-012 - Exportar o roteiro guardado para composição no Canva

- Estado: exportação implementada e plugin privado criado em 2026-10-08.
- Decisão: exportar instruções e JSON do snapshot guardado, não apenas orientação
  genérica de curadoria. Usar os PDFs existentes como estrutura e o modelo
  [modelo Canva](https://canva.link/5u8zxudd1vkcbth) como identidade visual.
- Evidência: modelo resolvido para DAHDpPXVRsU, LISBON IN PERSPECTIVE, 87 páginas
  de 672 x 1056; conteúdo e miniaturas inspecionados sem editar o original.
- Limites: excluir contactos, referências e notas internas; preservar incertezas,
  idiomas e moedas. Não copiar os factos de exemplo do modelo para outra viagem.
- Entrega: plugin privado 0.2.0, ID Plugin_600e0d208a74819191cafc6c69a90579,
  com dependência Canva; pacote-fonte em plugins/blu-curadoria/.
- Validação: testes unitários e navegador com API real, histórico imutável e
  layouts 1440/390/320 px. PDF final via Canva ainda não validado numa proposta real.
- Revisão: trabalhar numa cópia e aprovar a pré-visualização antes de aplicar
  alterações quando a ferramenta Canva exigir aprovação.

## D-013 - Integrar dev e rever a entrega TXT/Canva

- Estado: aplicado na pasta ativa em 2026-10-09, sem commit ou push.
- Base: origin/dev em bbd58c8; ficheiros locais reconciliados e backup anterior
  em before-dev-application-20261009, na pasta irmã.
- Decisão: TXT 1.1.0 preserva personalização, capacidade diária, períodos livres
  e percursos guardados. Plugin-fonte 0.3.0 aceita também TXT 1.0.0.
- Lixo: restaurar a versão antes de exportar TXT; não alterar PDFs históricos.
- Entrega: meteorologia dinâmica não é snapshot. PDF Canva, PDF DMC e partilha
  integrada são artefactos distintos. Nova curadoria exige TXT da nova versão.
- Limites: revisão do pacote-fonte não atualiza a instalação do plugin. Serviços
  externos, credenciais e uma proposta real no Canva continuam por validar.
- Correção de auditoria: parents[2] em src/blu_ai/config.py resolve corretamente
  a raiz. A indicação contrária no relatório inicial era um erro de inspeção.

## Questões abertas após integração

### Integração autorizada de dev em plugin_TXT_export — 2026-10-12

- Referências: HEAD inicial `def34fa` e origin/dev atualizado em `ceae821`.
- Manter o branch ativo e incorporar o histórico de dev por merge local.
- Preservar TXT/Canva 1.1.0, snapshots, privacidade e estado de exportação PDF.
- Conciliar caminhos AWS e correções IAM/Bedrock com as melhorias da interface.
- Regenerar o warehouse pelo ETL; testar propostas em armazenamento temporário.
- Evidência e limites em `docs/TESTING.md`.
- Não publicar o branch ou atualizar a instalação Canva sem nova autorização.

- O-001 - Confirmar base dos próximos PRs face à política dev e referência main.
  A responsabilidade operacional Next.js/analítica Streamlit está resolvida.
- O-002 - Definir Bedrock/OpenAI, contratos, avaliação e revisão antes de integrar.
- O-003 - Escolher cenário e fornecedor, termos, custos, evidência e falhas.
  Rotas são hipótese, não decisão.
- O-004 - Definir conteúdo S3, região, encriptação, retenção e fallback.
- O-005 - Definir consentimento, minimização, acesso, logs e eliminação antes de
  partilha pública ou envio de briefs a fornecedores.
- O-006 - Definir política de snapshot/artefacto CI do warehouse.
- O-007 - Definir gates e exceções auditáveis para erros PDF/conflitos estruturados.
- O-008 - Definir provisionamento Python/modelos/fontes em deployment.
- O-009 - Definir partilha, Lixo/restauro, retenção e imagens licenciadas.
- O-010 - Definir autenticação, permissões, sincronização e recuperação.

## 2026-10-13 — Arranque portátil no SageMaker

Estado: implementado e validado localmente.

O arranque preserva Node compatível, inicia o agente Python apenas com
`BLU_START_AGENT=1` e valida a origem HTTPS, porta, prefixo e build. Recusa uma
porta ocupada antes de recompilar para proteger o servidor já em execução.
O servidor usa a origem configurada nos redirecionamentos e resolve a pasta
do portal a partir do próprio script.

Evidência: `npm run check` passou (93 testes aprovados, um ignorado), build
AWS passou, testes `aws-config.test.mjs` passaram e conflito de porta foi
confirmado por execução. O teste de navegador está limitado por bibliotecas
Chromium ausentes. Sem os erros do colega, a causa na sua instância não foi
confirmada. Não foi efetuado push nem deployment.

## 2026-10-15 — Recursos do overlay e atributos de extensões

O overlay Next 16.4 usa caminhos absolutos para Geist e stack frames, que saem
do prefixo do proxy SageMaker. Um loader Turbopack limitado aos dois módulos
de desenvolvimento aplica o prefixo configurado, sem editar node_modules.
Reavaliar a adaptação quando atualizar o Next.js.

O body usa suppressHydrationWarning para atributos acrescentados por extensões
como Grammarly antes da hidratação; a validação dos descendentes permanece ativa.

Validação: check aprovado (100 testes e um ignorado), build aprovado e Chromium
local com os caminhos raiz bloqueados e atributos Grammarly simulados. A fonte
e o endpoint de stack frames responderam HTTP 200 no prefixo; não houve avisos
de hidratação. A sessão autenticada remota do Studio não foi testada.

## 2026-10-15 — Identificação e acessibilidade dos formulários

Os campos sem identificação passam a ter nomes explícitos. No briefing, os
rótulos usam htmlFor e IDs estáveis; títulos de grupos de botões usam legend
dentro de fieldset. As notas referenciam o título visível e a pesquisa de
experiências tem nome acessível. Não foram alterados os contratos dos pedidos.

O teste de briefing verifica campos sem identificação ou rótulo, labels órfãs
e IDs duplicados. Chromium aprovou os cenários de 360 e 1440 px, incluindo
revisão, edição e payload. Check aprovado (100 testes e um ignorado) e build
de produção aprovado.

## 2026-10-15 — Migração incremental HTML/Python

Branch `refactor/html-python`, criado de `chore/project-cleanup` em `da8de67`.
A consulta, paginação, enriquecimento e preparação de referências históricas
passam para `portal/data.py`. O explorador passa a formulário GET e links HTML,
com registos renderizados por template local escapado. A pesquisa é aplicada
explicitamente com Filtrar; filtros e página ficam no URL e funcionam sem JS.
Valores vazios nas fontes são apresentados como «—» em todos os idiomas.

A composição TXT/Canva passa para `portal/prompt.py`; orçamento e pendências
continuam calculados pelas regras usadas pelo editor/PDF. O adaptador assíncrono
`src/lib/python-portal.ts` usa stdin/stdout JSON, UTF-8, timeout e limite de saída.
Não há novo servidor, dependências Python adicionais ou implementação duplicada.
A consulta de fontes e TXT requerem agora Python mesmo sem tradução ou agente.

O editor e as regras executadas no navegador permanecem em TypeScript. Não se
migrou SQLite/versionamento ou PDFKit nesta etapa: preservar os contratos e a
biblioteca atual evita reconstruir persistência e PDFs durante a simplificação.
Meteorologia e otimização de percursos têm consumidores em ambos os ambientes.
Uma migração futura deve rever essa fronteira antes de mudar a linguagem.

Evidência: 101 testes do portal e 27 Python aprovados, um teste do portal
ignorado, build aprovado; 24 TXT idênticos byte a byte à implementação anterior.
Chromium de produção: consulta HTML com/sem JS em duas larguras; navegação em
seis idiomas e duas larguras; briefing em duas larguras; TXT em três larguras,
privacidade, Lixo/restauro e estado PDF preservado. Exports em armazenamento
temporário e traduções com mocks. Sem publicação ou validação de fornecedores reais.

## 2026-10-15 — Meteorologia Python e controlos HTML nativos

Continuação no branch `refactor/html-python`, a partir de `cfcf325`.
Coordenadas, WMO, leitura da previsão e fallback histórico passam integralmente
para `portal/weather.py`. O navegador usa apenas a API local, com cache de
resultados disponíveis. A API mantém GET e acrescenta POST para itens do dia;
limita o pedido e não guarda indisponibilidade em cache. Dados ausentes não
originam temperaturas fixas nem precipitação zero na apresentação.

A ferramenta meteorológica do agente reutiliza essa implementação. Foram
removidos as coordenadas duplicadas e o fallback que inventava temperaturas e
condições favoráveis. Histórico é identificado como referência, não previsão.

O painel usa popover HTML nativo com fecho por Escape, clique fora e botão.
O histórico usa formulário GET para idioma e formato, sem estado React para
construir os links; downloads funcionam sem JavaScript. Não se alteraram hashes,
snapshots, contratos de persistência nem bytes PDF já guardados.

Evidência: 96 testes Node aprovados e um ignorado; 37 Python aprovados; build
aprovado. Chromium de produção: meteorologia simulada em 320/1440 px; downloads
TXT em francês e ZIP PDF em duas larguras, com e sem JS, e privacidade preservada.
Exports isolados em pasta temporária. Validação de erros da API sem contactar o
fornecedor. Testes meteorológicos Python incluídos no CI de dados. Sem push,
merge ou publicação.

## 2026-10-15 — Catálogo SQLite Python e ação HTML de Lixo

Continuação em `refactor/html-python`, a partir de `d22c13e`.
`etl/portal_catalog.py` concentra a persistência operacional e a integração ETL.
O esquema mantém as tabelas de registos e histórico. Escritas e verificações de
revisão usam transações; o ETL continua a ler a fonte em modo read-only.
As entradas são validadas e normalizadas pelo contrato TypeScript partilhado com
o editor, antes do processo Python. Não há segundo esquema de validação.

A seleção de IDs é partilhada com o ETL, preservando a semântica nullish do portal;
267 IDs de dados e casos sintéticos coincidiram com a implementação anterior.
A leitura elegível e os overrides de regras passam para Python; removeu-se o
módulo TypeScript `published-catalog.ts`. As APIs usam chamadas assíncronas e
continuam a devolver conflito 409 para revisões obsoletas.

Os caminhos `BLU_DATA_DIR` e `BLU_WAREHOUSE_DIR` aplicam-se também à publicação,
permitindo testes completos isolados. Os padrões de produção não mudam.
O formulário POST do histórico envia versões para o Lixo sem JavaScript,
valida a origem e redireciona com 303; erros regressam ao histórico. O contrato
JSON do editor e do Lixo interativo permanece disponível. Não foram alterados os
snapshots, hashes ou bytes PDF das versões existentes.

Evidência: 96 testes Node aprovados e um ignorado; 44 Python aprovados; build
aprovado; integração catálogo → ETL → geração → inativação aprovada. Em produção
isolada passaram edição HTTP, conflitos, publicação e inativação; o editor passou
em seis idiomas e duas larguras com mocks; formulários, downloads, Lixo/restauro,
erros e origens passaram com e sem JS. Usaram-se cópias temporárias de fontes,
warehouse e exports. Sem merge, push ou publicação externa.

## 2026-10-15 — limpeza após migração do catálogo

Removidos os comandos internos `enrich` e `catalog-id`, usados apenas por testes
Node que repetiam cobertura Python. A identidade histórica e o enriquecimento
continuam implementados e testados em Python. Retirados o adaptador `legacyId` e
o método `CatalogStore.publishedFlags`, sem consumidores de produção.

Eliminado `dataset.test.mjs`: o teste de Python indisponível passa para
`infrastructure.test.mjs` e as validações operacionais para
`catalog-matching.test.mjs`. Corrigida a posição de `unittest.main()` para a
execução direta incluir todas as classes do catálogo.

Evidência: `npm run check` com 95 testes aprovados e um ignorado; 44 testes
Python aprovados; build e integração catálogo/ETL aprovados em dados temporários.
Não foram repetidos os cenários de navegador nesta limpeza.

## Observatório de dados — 2026-10-16

O dashboard Streamlit passa a organizar a consulta em cinco áreas de decisão:
panorama, exploração da oferta, preços, histórico e qualidade. Mantém leitura
SQLite em modo `ro` e não introduz persistência ou dependências adicionais.
A consulta volta a ler a entrega em cada execução, evitando caches desatualizadas.

Preços são filtrados por categoria, unidade e natureza comercial antes de calcular
a mediana; continuam referências, sem inferir margens ou cotações. A presença de
atividades em roteiros mede menções em roteiros distintos, não vendas ou procura.
O anterior score de campos não nulos deixa de ser apresentado como prontidão.

A vista geográfica usa coordenadas dentro dos intervalos válidos e contornos
locais Natural Earth da Europa e norte de África, sem fornecedor de mosaicos ou
geocodificação externa; a validade geográfica exige revisão.
Localizações das experiências preservam o texto da fonte e não são fundidas com
cidades por aproximação. O dashboard não apresenta contactos ou textos integrais
de propostas históricas. Acesso local mantém o binding localhost autorizado.

### Exploração do observatório — 2026-10-16

Os eventos do mapa transportam chaves de entidade, não índices de pontos ou de
linhas, para abrir a ficha correta após filtros ou agrupamento. O agrupamento é
manual, por tipo e grelha de 0,1 graus, com todos os membros disponíveis na ficha.
Os filtros de camadas afetam apenas a vista geográfica. Comparações preservam
preços e durações como texto contextual da fonte, sem pontuação de preferência.

A presença histórica usa a relação explícita `id_atracao_base` e conta roteiros
distintos; restaurantes e experiências sem esse contrato não são associados por
nomes semelhantes. Destinos mantêm correspondência literal das localizações.
A fila de revisão sinaliza desconhecidos e expressões de confirmação; prioridade
comercial para preço/condições e operacional para os restantes campos analisados.
O modo apresentação é apenas uma disposição local, com navegação e saída visíveis.

## Contratos finais do Observatório — 2026-10-16

Normalização conservadora em `etl/observatory.py`, com vocabulário e aliases
versionados em `config/observatory.json`. O ETL publica três modelos analíticos;
a definição inclui a versão e o hash das regras. O dashboard reutiliza o mesmo
módulo em memória para entregas antigas, sem escrever no warehouse ou consultar
rascunhos do catálogo. Descrições originais e condições das unidades são mantidas.

Confirmação por campo exige estado explícito, fonte, data e valor correspondente.
Datas gerais de pesquisa e aprovação do catálogo não confirmam preços. Janela
completa e data atual são necessárias para evidência vigente; o dashboard reavalia
expiração sem prolongar prazos. Metadados inválidos impedem a publicação do ETL.
Os dados reais sem evidência permanecem pendentes; nenhum valor foi confirmado
por inferência. Contrato de origem e limites no [guia do Observatório](OBSERVATORY.md).

Fotografias CC0 de Lisboa e Porto guardadas localmente com atribuição, origem e
hashes em `dashboard/assets/photos.json`. São enquadramento de destinos, sem
associação inferida a atividades. Não há downloads automáticos no dashboard.

Evidência: 66 testes Python aprovados, incluindo entrega ETL temporária,
normalização, evidências inválidas, expiração e fotografias; integração catálogo/ETL
aprovada. Navegador local e AppTest nas seis áreas aprovados. `git diff` confirma
que fontes e warehouse reais não foram alterados.

## Enriquecimento de dados reais — 2026-10-16

O preenchimento usa exclusivamente novas revisões no catálogo operacional e
publicação pelo ETL. Os Excel/PDF foram preservados. O contrato `sourceData`,
já existente, passa a persistir evidência por campo e referências públicas
exatas a lacunas da tabela de preços. O ETL mantém valores conhecidos e regista
preenchimentos em `verified_enrichment_changes`.

O lote adiciona 45 valores em 13 registos e três valores numéricos na referência
do Jardim Botânico de Lisboa. A validação ocorreu primeiro numa cópia. Históricos
aprovados preservados; só a revisão corrente é incrementada. Prazos explícitos
aplicados exclusivamente aos preços abrangidos pela fonte. Não se atribuíram
datas a propostas históricas, tarifas de aquisição ou compatibilidades inferidas.
Fontes e limites no [relatório de enriquecimento](DATA_ENRICHMENT.md).

## Refinamento visual editorial do portal — 2026-10-18

- No branch `portal-observatorio`, manter superfícies claras e reforçar a
  identidade BLU com navegação azul profunda, acentos dourados e tipografia
  editorial.
- Melhorar a hierarquia do briefing, numerar etapas e aumentar a legibilidade
  dos campos partilhados; preservar os fluxos e a navegação móvel existentes.
- Afinar três traduções portuguesas do cabeçalho, mantendo as chaves existentes.
- Animação de entrada respeita movimento reduzido; foco visível nos controlos.

Check aprovado (95 testes e um ignorado), build de produção aprovado e 42
cenários de interface em seis idiomas aprovados com dados e tradução simulados.
Inspeção visual em 390/1440 px. Resultados detalhados no `PLAN.md`.

## Observatório nativo independente — 2026-10-18

- Criar a versão do portal em componentes React/HTML/SVG, sem iframe ou alterações
  à aplicação Streamlit, aos seus estilos, recursos e comandos de arranque.
- Reutilizar a ponte `portal.data`, os contratos de `etl.observatory` e os modelos
  publicados para destinos e unidades. A evidência é reavaliada à data da consulta.
- Ler as tabelas numa transação SQLite em `mode=ro`, com uma lista fixa de tabelas,
  e devolver apenas os campos necessários à análise. Sem persistência adicional.
- Reutilizar os contornos Natural Earth locais, com créditos, sem mosaicos externos.
- Preservar zeros, ausências, condições originais e relações explícitas do histórico.
  Não agregar referências de categorias, unidades, condições, naturezas ou moedas
  diferentes. Não inferir disponibilidade ou cotação a partir da análise.
- Manter o editor operacional montado após a primeira abertura para não perder
  o formulário ao alternar entre análise e gestão.

Validação: check (97 testes, um ignorado), build, 83 testes Python e integração
catálogo/ETL aprovados. Seis áreas e interações reais em 320/1440 px; doze
cenários do editor com dados e tradução simulados. Recuperação de falha e
preservação de formulário verificadas sem guardar. `git diff` confirmou o
dashboard original e os dados reais intactos. Sem publicação ou chamadas a IA.

## Legibilidade do mapa e grelha de painéis — 2026-10-18

- Dimensionar marcadores, etiquetas e contornos em píxeis de ecrã através da
  escala efetiva do SVG, mantendo áreas de clique de 44 px durante o zoom.
- Agrupar pontos visualmente próximos por predefinição; o zoom separa ofertas.
  As etiquetas evitam sobreposição e o foco mostra o nome completo.
- Usar uma altura de conteúdo comum nos painéis adjacentes em ecrãs largos,
  com lista rolável e barras distribuídas; em móvel as alturas adaptam-se ao conteúdo.
- Alterar apenas a versão nativa no portal; dashboard original e dados preservados.

Validação: check (97 testes, um ignorado) e build aprovados. Navegador em
320/1440 px confirmou alvos de 44 px com zoom, etiquetas sem sobreposição e
painéis adjacentes com diferença inferior a 2 px em desktop. Inspeção visual
em 390/1440 px; alturas móveis adaptáveis. Grupos com destinos diferentes
apresentam a contagem de destinos, sem adotar o nome do primeiro membro.

## Largura comum do portal — 2026-10-18

- Centralizar a largura exterior máxima em `--portal-page-width: 1440px` e as
  margens em `--portal-page-gutter`, com 16 px em móvel e 32 px a partir de 640 px.
- Aplicar o mesmo contentor ao cabeçalho, workspace e páginas de catálogo,
  histórico, referências, lixo e partilhas, incluindo o erro das referências.
- Retirar o limite independente de 900 px do briefing, que ocupa agora a área
  disponível dentro do workspace. Preservar a composição de navegação/assistente
  e a coluna de leitura do documento partilhado.
- Comparar larguras, posições e espaçamento no navegador em 320/1440/1920 px.

Resultados de validação registados no `PLAN.md`.

## Largura fluida do portal — 2026-10-18

A pedido do utilizador, substituir o limite de 1440 px por contentores a 100%
do espaço disponível. As margens comuns usam `clamp(1rem, 2.25vw, 4rem)`;
a composição interna mantém as grelhas responsivas e a coluna de leitura
das partilhas. Esta decisão substitui o teto da entrada anterior.

## Temas do portal — 2026-10-18

O tema claro continua a ser o padrão, independentemente do tema do sistema.
A opção escura usa uma paleta partilhada de superfícies, texto e bordas com
`light-dark()`, mantendo as cores originais no modo claro. A preferência fica
em `blu-portal-theme` no navegador e é aplicada antes da hidratação, com
sincronização entre separadores. Armazenamento bloqueado não impede a troca
na sessão. A impressão mantém a paleta clara; os templates PDF e o dashboard
analítico original não dependem desta preferência.

## Limpeza de cobertura repetida — 2026-10-18

A revisão não identificou baterias inteiras de funcionalidades removidas.
Manter os testes do dashboard original, adaptadores, modelos opcionais e
contratos de dados: verificam fronteiras distintas das do portal.
Retirar os seis casos responsivos de 360 px, já cobertos pelos 320 px mais
restritivos no mesmo formato, e os seis de navegação a 1920 px, cobertos por
1440 e 2560 px no mesmo formato desktop. Manter os seis idiomas, a mudança
de navegação aos 1024 px, tablet, texto ampliado, teclado, mapas e temas.
Eliminar asserções de invisibilidade imediatamente após esperas pelo mesmo
estado. A bateria `test:ui` passa de 66 para 54 combinações.

## Apresentação isolada do portal AWS — 2026-10-18

Por pedido do utilizador, o protótipo de apresentação é uma aplicação estática
independente em `presentation/dist/`, servida por Python padrão na porta 3003.
Não integra rotas Next.js, APIs, dados operacionais nem o armazenamento do
portal. As três cenas usam exemplos fictícios e um mapa esquemático. O estado
é apenas em memória. Os serviços existentes nas portas 3001 e 8501 não são
reiniciados nem recompilados para executar esta apresentação.

## Oito capítulos e destino explícito do Observatório — 2026-10-18

A apresentação independente passa a oito capítulos e mantém os exemplos
preparados separados de dados operacionais. As escolhas em memória acompanham
o roteiro, a pré-visualização ilustrativa e o resumo final. O CTA do último
capítulo usa o endereço exato fornecido pelo utilizador, centralizado em
`observatoryUrl`, sem inferir o domínio da apresentação. Abre um separador
separado; os testes verificam o destino sem contactar o portal real.

## Ato técnico e animações controláveis — 2026-10-19

Adicionar cinco cenas técnicas como módulo estático da apresentação da porta
3003, antes das oito cenas narrativas. A navegação distingue fundamentos,
experiência e portal real; a terceira parte abre o endereço fornecido pelo
utilizador num novo separador. As animações explicam ligações, passagem entre
etapas e realce de contratos, sem executar serviços ou operações reais.
Movimento reduzido e o controlo manual desativam efeitos, preservando texto,
estado e navegação. O portal e os dados operacionais permanecem separados.

## Endereço público Studio indicado pelo utilizador — 2026-10-19

A base pública fica em `config/studio.json`, em vez de ser inferida do ID
interno do domínio da instância. `scripts/studio_urls.py` gera as ligações
para as portas; o arranque AWS usa a origem configurada quando não existe
`PORTAL_PUBLIC_ORIGIN` explícito. A apresentação e o arranque Streamlit
anunciam a base indicada, mantendo os endereços locais para execução.
A configuração não cria domínios nem renova a autenticação do SageMaker.

## Separação editorial e aprofundamento técnico — 2026-10-19

Retirar as cenas de dados e arquitetura da parte narrativa, porque já pertencem
aos fundamentos. A apresentação fica com seis cenas técnicas e seis narrativas.
Separar arquitetura de tecnologias e conservar detalhes de implementação num
inventário editorial próprio. Versões declaradas e defaults do código não
representam configuração efetiva ou métricas medidas. Registar no guião as
lacunas a preencher com a equipa e manter a distinção entre simulação e sistema.

## 2026-10-19 — TXT e execução Canva

O prompt 1.4.0 concentra regras essenciais sem mudar o JSON 1.1.0. O plugin
0.4.0 evita carregar curadoria na composição e pedir aceitação do plano.
A exigência de preview/aprovação antes de commit pertence ao Canva, não é
removível por prompt. Teste real: DAHDpPXVRsU devolve dataset vazio; cópia de
quatro páginas aceita edição do dia 1, mas a nota cresce além do painel.
Validar capacidade cedo e agrupar operações por página. Autofill permanece
condicionado a um futuro schema verificado; não alegar melhoria de tempo
ou tokens faturados sem medição comparável.

## 2026-10-21 — Integrar dev em txt_export_plugin

Integração de `origin/dev` (`aa385fd`) no branch `txt_export_plugin`, mantendo o
histórico dos dois branches. Os conflitos documentais preservam as decisões de
TXT/Canva de 19 de outubro. O plugin conserva o workflow eficiente, a referência
visual e os limites de entrega do branch, sem repor o workflow anterior de dev.
A interface conserva o rótulo Exportar TXT e as traduções correspondentes.

A identidade local Streamlit foi preservada fora do índice, tal como as contas,
runtime e configuração privada Studio. Nenhum ficheiro de warehouse foi editado
manualmente: as alterações provêm da integração de dev. Não houve publicação,
chamadas ao Canva ou ao Bedrock, nem integração de outros branches.

Validação local: 83 testes Python aprovados; check do portal com 97 aprovados e
um ignorado; build, catálogo/ETL e estrutura documental aprovados. Navegador:
TXT/Canva em 320/390/1440 px, incluindo histórico, Lixo/restauro, privacidade e
estado do PDF inalterado; temas em 320/768/1440/2560 px. Armazenamento temporário
e tradução simulada; sem validação real de fornecedores externos.

## Monitoring independente no Studio — 2026-10-19

A pedido do utilizador, a primeira implementação fica em `monitoring/`, porta
3004, com login próprio e escuta apenas em loopback atrás do HTTPS Studio.
Usa biblioteca padrão Python para não exigir os grupos opcionais do sistema.
A interface e a API de estado exigem sessão; o CSS do login é público.

Sondas de leitura e agregados do warehouse alimentam histórico em memória e
logs com rotação, sem escrever nas aplicações, executar ETL ou chamar modelos.
Não existe ainda tracing, instrumentação de todos os pedidos nem notificações
externas. A cadência do warehouse é desconhecida até ser configurada.

Credenciais derivadas, acesso inicial e logs ficam em `monitoring/runtime/`,
excluído do Git e do contexto Docker. O servidor interno e as sessões em memória
não constituem uma decisão de hosting de produção. Consultar os contratos e
limites no [guia do monitoring](../monitoring/README.md).

Evidência: dez testes Python de autenticação/sondas/HTTP e cenários de navegador
em quatro larguras aprovados. Recolha local real dos serviços existentes
confirmada; proxy HTTPS autenticado e fornecedores externos não validados.

### Encaminhamento no Code Editor — 2026-10-19

O proxy instalado rejeita com HTTP 400 portas ausentes da sua lista de
encaminhamento; o login local disponível não comprova esse acesso. O arranque
e o README passam a indicar a adição da porta no separador Ports do editor.

O proxy também acrescenta o seu prefixo a cabeçalhos Location iniciados por
`/`. Os redirects do monitoring passam a usar o URL público canónico completo
para evitar duplicação. Dez testes Python e quatro larguras de navegador
aprovados após a alteração; acesso AWS depende do encaminhamento no editor.

## Gestão de contas no monitoring — 2026-10-19

A administração de acessos fica no próprio monitoring, em `/users`. Perfis
`admin` e `viewer` distinguem gestão de contas e consulta, com autorização
no servidor e CSRF em todas as alterações. A conta legada conserva o hash e
passa a administrador; o formato local com várias contas é guardado de forma
atómica na primeira alteração. Não foi criada outra base do catálogo.

Alterações de palavra-passe, perfil, estado e remoção revogam as sessões da
conta. Não se pode remover/desativar a conta em uso nem retirar o último
administrador ativo, incluindo em pedidos concorrentes. A recuperação CLI
preserva outras contas e deve ser feita com o serviço parado.

A exclusão de `monitoring/runtime/` estava comentada e os seus ficheiros
tinham sido versionados. A regra foi reativada, os ficheiros foram retirados
do índice sem eliminar as cópias locais e o verificador estrutural passa a
rejeitar esses caminhos no Git. O histórico não foi reescrito; a credencial
inicial deve ser alterada se ainda for usada.

Evidência: 18 testes Python e cenários completos de gestão de contas em
320/768/1440/2560 px aprovados, com inspeção visual. As quatro pendências
de monitoring do plano continuam abertas.

## 2026-10-19 — Telemetria operacional reduzida e privada

O monitoring agrega eventos locais do portal e do agente sem guardar prompts,
respostas, corpos de pedidos, dados de clientes ou exceções completas. Backups do
catálogo, warehouse e itinerários incluem hashes e só contam como verificados após
um restauro isolado e verificação de integridade SQLite. Incidentes são deduplicados
numa fila local com eventos de abertura e recuperação. Integrações externas ficam
desativadas até serem definidos canal, destinatários e gestão de credenciais.

## 2026-10-19 — Limpeza automática conservadora

O monitoring pode libertar caches regeneráveis e aplicar retenção aos seus próprios
backups quando a ocupação do disco atingir 85%, com intervalo mínimo de 24 horas.
Mantém pelo menos cinco backups completos e só remove excedentes com sete dias.
Catálogo, fontes, warehouse, exports, credenciais, ambientes e dependências ficam
fora do âmbito. A execução manual exige perfil administrador, origem válida e CSRF.

## 2026-10-19 — Logs operacionais centralizados

Reutilizar `monitoring/runtime/portal-events.jsonl` como fonte persistente dos logs do
portal, mantendo rotação e compatibilidade com os sinais operacionais existentes. A
instrumentação cliente regista navegação, interações e pedidos API; a instrumentação
do servidor regista erros não tratados e os fluxos explícitos continuam a registar
operações de domínio. Escritas no processo Node são serializadas e eventos idênticos
da mesma interação são limitados no browser.

O portal não dispõe de identidade própria. A tabela apresenta um identificador
aleatório da sessão do separador, `server` ou `system`, sem atribuir a ação a uma
pessoa. Valores de formulários, corpos HTTP, labels, prompts e respostas não são
capturados. Mensagens e stacks são limitadas e redigidas antes da persistência. A
consulta permanece protegida pelo login do Monitoring e os ficheiros não são servidos
diretamente.

## 2026-10-19 — Configuração individual do SageMaker Studio

A 2026-10-19, a configuração pública do Studio passou de
`config/studio.json` para `config/studio.local.json`, ignorado pelo Git. A decisão
anterior de centralizar a base mantém-se; a localização passou a ser individual
para impedir que o identificador de um espaço seja aplicado aos ambientes dos
restantes colegas. `config/studio.example.json` documenta o contrato e
`scripts/setup_workspace.py` valida e escreve o valor local.

## 2026-10-20 — Consolidação da documentação ativa

O README fica como entrada curta para preparação e arranque. Arquitetura, dados,
portal, operações e testes mantêm uma responsabilidade própria e os READMEs dos
componentes remetem para esses guias em vez de repetir procedimentos extensos.
Resultados transitórios de testes saem do guia operacional; este ficheiro conserva
o contexto histórico e o Git preserva versões anteriores.

O lint Markdown ignora diretórios ocultos e extensões do ambiente SageMaker, que não
pertencem ao repositório. A apresentação deixa de conter o identificador de um
espaço Studio: o destino do portal deriva do URL atual, com fallback local.

## 2026-10-20 — Preparação independente de clones de desenvolvimento

O repo fornece os ficheiros necessários para inicializar uma sessão: fontes,
warehouse publicado, lockfiles, launcher e exemplos de configuração. Acrescentado
`.env.example` sem segredos e `--initialize-data` ao assistente para criar catálogo
e itinerários locais através do contrato de recuperação existente. As contas são
geradas por instalação, sem versionar credenciais ou duplicar persistência.

A preparação seleciona Node e npm da mesma instalação suportada, verifica os
artefactos mínimos e permite usar `./bin/just` quando o launcher global pertence
a outro checkout. O guia inclui os comandos para instalar dependências antes da
inicialização. Não existe publicação nem transferência de dados operacionais.

Evidência: 16 testes de preparação/operações aprovados; ensaio com `git archive`
num diretório e HOME temporários, sobrepondo apenas o assistente alterado e o
exemplo de configuração. Sem catálogo, exports ou contas de origem, criou os três
conjuntos necessários e preservou-os numa segunda execução. Reutilizaram-se Python,
Node e dependências locais; não se validaram downloads, proxy Studio, outra
identidade IAM ou Bedrock real. A validação num segundo espaço AWS mantém-se no plano.

## 2026-10-21 — Integrar monitoring na apresentação técnica

Integração de `feat/monitoring-deployment` (`8c0dee2`) em
`apresentacao-tecnica`, preservando as decisões TXT/Canva e o plano anterior como
registo histórico. O plano ativo mantém as pendências de monitoring para
produção: notificações externas, backups externos cifrados e sonda externa.

As alterações locais da apresentação baseada no PPT foram guardadas num stash
identificado antes do merge para reaplicação posterior, sem incluir o PPT ou
dados privados. As contas e o runtime reais não são versionados nem substituídos.
O teste de navegador foi atualizado para os controlos Todos/Apenas erros e os
painéis de logs existentes, em vez dos seletores de filtros já removidos.

Validação: 90 testes Python, 35 testes de monitoring/operações, check do portal
com 98 aprovados e um ignorado, build e catálogo/ETL aprovados. Testes com mocks
e dados temporários; sem publicação, infraestrutura ou fornecedores reais.

## 2026-10-21 — Incorporar o PowerPoint na apresentação interativa

O PowerPoint local do Grupo 4, versão 2026-10-30, fornece o contexto académico
P6, a parceria BLU, a visão de três componentes, as interpretações Soft/Classic/
Signature e a equipa. Estes conteúdos foram incorporados nas cenas existentes,
conservando os seis capítulos técnicos e os seis narrativos. Classic é a seleção
inicial; a escolha explica a abordagem e acompanha o resumo, sem recalcular
atividades ou preços na simulação. O ficheiro PowerPoint não foi alterado.

As notas WIP do documento não comprovam implementação. Google Forms foi
substituído pelo briefing do portal; contagens antigas não substituem os seis
idiomas e seis áreas atuais. O fluxo Canva usa TXT com JSON da versão guardada
e o PDF Canva não altera o PDF DMC. Autosserviço e CRM são evolução proposta;
HPO, Model Registry, Endpoint e Model Monitor não são apresentados como ativos.

Validação: navegador em 320/768/1440/2560 px, navegação, seleção das abordagens,
preservação do roteiro, animações e isolamento aprovados; estrutura documental,
Markdown e sintaxe JavaScript aprovados. Conteúdo e layout inspecionados em
capturas locais. Sem chamadas a fornecedores ou alterações no portal real.

## 2026-10-21 — Ícone comum nos separadores BLU

O portal, o Observatório Streamlit e as três páginas do Monitoring reutilizam
o SVG b da apresentação. A configuração partilhada reside em
`dmc-workspace/public/branding.json`, dentro da raiz de build do portal, e é
consumida também pelas interfaces Python. O Monitoring permite imagens data URI
na política de conteúdo para apresentar este ícone sem pedidos externos.

Validação: build do portal aprovado, seis testes HTTP do Monitoring aprovados,
SVG confirmado nas páginas de login, painel e utilizadores e no adaptador
Streamlit; estrutura documental e whitespace verificados.

## 2026-10-21 — Enquadrar a apresentação na janela

A apresentação mantém título, navegação e avanço dentro da altura disponível.
O módulo `viewport.js` mede a cena e conserva a composição normal quando cabe;
caso contrário, a folha `viewport.css` divide o conteúdo em passos laterais
dentro do mesmo capítulo, sem reduzir globalmente a escala da página. O texto
de leitura varia entre 14 e 18 px conforme a largura. Em janelas baixas, um
seletor compacto substitui o índice; a introdução permanece nos passos.

O estado das escolhas é preservado ao redimensionar, e os detalhes selecionados
são revelados no passo correspondente. As setas percorrem os passos antes de
mudar de capítulo; os botões principais conservam o avanço entre capítulos.
O modo de impressão recupera o fluxo contínuo. Os assets novos têm referências
versionadas para evitar a utilização de scripts ou estilos anteriores em cache.

Validação: 12 capítulos e todos os passos em 320×568, 390×844, 768×1024,
1366×768, 1440×900, 1920×1080 e 844×390; limites horizontais e verticais,
conteúdo sem cortes, tamanho de leitura, estado ao redimensionar e teclado.
Regressões completas de interações e animações aprovadas em quatro larguras.
Capturas locais inspecionadas; nenhuma chamada a modelos ou alteração ao portal.
