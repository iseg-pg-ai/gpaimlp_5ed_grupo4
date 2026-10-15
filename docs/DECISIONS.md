# Decisões e questões abertas

## Pré-visualização visível e confirmação contextual — 2026-10-15

A auditoria confirmou uma proposta com ação válida, embora o utilizador apenas
visse a resposta textual. A pré-visualização estava antes das mensagens e o
scroll automático deslocava o painel para o fim. Colocar a proposta após as
mensagens e incluir a proposta nas dependências do scroll. O teste deve verificar
que o botão fica dentro do viewport e dos ancestrais com clipping, antes de o
Playwright poder deslocar automaticamente a página para clicar.

Um «ok» não inicia outra inferência nem apaga a proposta pendente: orienta para
o botão de aceitação. Sem proposta pendente, explica essa ausência. Respostas
sem ações são explicitamente informativas. Não converter texto em aceitação
implícita nem contornar as validações do roteiro.

Separar também falha de formato do modelo, permissões IAM, contexto demasiado
grande, timeout e ligação. O diagnóstico usa apenas códigos controlados, sem
texto de pedidos, respostas brutas ou credenciais nos logs. A mensagem antiga
«AWS indisponível» não distinguia estes casos.

## Correção da origem em execução — 2026-10-15

O utilizador confirmou que o navegador usava uma origem SageMaker diferente da
configurada pelo agente no arranque. Corrigir a variável de ambiente do processo
e reiniciar, mantendo a validação exata de origem. Não acrescentar uma exceção
que confie em domínios arbitrários do pedido. Verificação local: portal 200,
origem correta chega à validação do corpo (400 num pedido vazio) e origem externa
é recusada (403). Sem chamadas ao Bedrock ou alterações a propostas neste teste.

## Mensagens do assistente perante falhas — 2026-10-15

Guardar a mensagem no navegador antes de iniciar a chamada ao planeador e
acrescentar qualquer erro no próprio chat. Antes, as mensagens só eram guardadas
após uma resposta bem-sucedida, pelo que uma recusa da API fazia o envio parecer
ignorado. Não criar versões de itinerário para mensagens ou falhas.

Evidência: check e build aprovados; teste de resposta 503 atrasada em 390/1600 px
confirma mensagem imediata, erro visível e roteiro preservado. A chamada real
API → adaptador Python → Bedrock com o pedido de remover a primeira atividade
passou num catálogo/export temporário. Não foi alterada a viagem do utilizador.
O erro da sessão original não foi observado diretamente; a correção permite
identificar a razão de futuras recusas sem expor pedidos nos logs.

## Primeiro incremento do agente AWS — 2026-10-15

Estado: implementado localmente; primeira parte das Fases 0 e 1.

Usar Amazon Bedrock Converse com IAM Role e contrato partilhado de propostas.
Não instalar um modelo local nem criar outro catálogo. O portal valida as ações,
apresenta antes/depois e exige aceitação ou rejeição. A aceitação volta a validar,
deteta concorrência e grava versão e auditoria na mesma transação do histórico.
Não registar o texto do pedido nos logs ou na auditoria; guardar apenas o seu hash.
O contexto usa campos explícitos e omite contactos, notas e confirmações internas.

O processo Python curto na instância apenas adapta a chamada AWS. Foi preparada
a mesma implementação para Lambda privado, invocado por IAM; não foi publicado
nenhum recurso cloud nesta entrega. O serviço FastAPI anterior deixa de ser
necessário ao painel e exige token para os consumidores legados.

Evidência: uma chamada real ao Nova Lite em eu-west-1 com dados sintéticos
devolveu a ação correta (1183 tokens de entrada, 74 de saída). Check do portal
aprovado (99 testes, um ignorado), 50 testes Python aprovados e build aprovado.
Interface validada em 390/1600 px com propostas simuladas; API real validada com
planeador simulado, exports e catálogo em diretórios temporários. Template Lambda
inspecionado estruturalmente; não validado por deployment. Ver limites e trabalho
pendente em [ASSISTANT.md](ASSISTANT.md) e [PLAN.md](../PLAN.md).

## Base do assistente — 2026-10-15

Estado: integração local validada no branch `pc/assistant-agent-for-blu-curator`.

Evidência: check do portal aprovado (95 testes, um ignorado), build aprovado,
suite Python aprovada e verificador documental aprovado. Modelos testados com
mocks; não foram realizadas chamadas reais ao Bedrock. Não foi efetuado push.

Integrar o código de `refactor/html-python` em `ff1559a`. Os conflitos estavam
limitados aos artefactos gerados do warehouse. A escolha inicial da entrega do
destino foi corrigida por indicação explícita do utilizador: preservar a entrega
completa de `refactor/html-python`, incluindo JSONL, manifest e SQLite.
Verificação desta correção: comparação Git integral do diretório sem diferenças
face a `origin/refactor/html-python`. Os testes acima antecedem esta correção.
Não regenerar o warehouse nem modificar fontes nesta integração.

Reutilizar o serviço `src/blu_ai/` e os contratos existentes. Começar pelas
Fases 0 e 1 do plano do assistente, verificando as premissas históricas contra
o código migrado. Ações do modelo serão propostas sujeitas a validação e
confirmação humana. Não são autorizadas chamadas pagas por esta preparação.

Os registos históricos conservam as datas e a evidência original. O mapa atual
está em [arquitetura](ARCHITECTURE.md); as tarefas em [PLAN.md](../PLAN.md).

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

Revisto em 2026-10-08. Decisões anteriores válidas preservadas; evidência atualizada
contra o checkout atual de main, commit f090e53.

## D-001 - Distinguir implementação e arquitetura futura

- Estado: aceite; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: ETL, warehouse, Streamlit e DMC Workspace são a base implementada.
  S3, Bedrock, APIs externas e AWS são objetivos futuros.
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
