# Plano de evolução do BLU AI System

Plano consolidado a partir do registo até 19-10-2026. Foram removidos os blocos de tarefas 
concluídas, resultados repetitivos de testes, pormenores transitórios de sessões, correções 
pontuais e histórico de implementação. Mantêm-se apenas pendências e informação técnica 
que condiciona decisões futuras. O estado deve ser confirmado no branch de trabalho antes 
de executar alterações.

## Estado atual e decisões a preservar
- Portal e dados: portal de curadoria com catálogo, itinerários, versões e entregas; warehouse e ETL existentes. Preservar f ontes Excel/PDF originais, revisões e snapshots históricos. Evitar alterações a dados reais durante testes: usar armazenamento temporário e mocks.
- Assistente BLU: operações estruturadas sobre itinerários, pré-visualização e confirmação humana antes de aplicar; catálogo e validações determinísticas continuam a ser a fonte de verdade. A implementação das fases 0–6 foi reportada como concluída no branch pc/assistant-agent-for-blu-curator, não sendo isso prova de integração noutros branches ou de validação completa em produção.
- IA: Amazon Bedrock; Nova Pro ficou como modelo predefinido configurável após testes limitados. Testes com mocks não demonstram qualidade do modelo real. Não executar chamadas pagas sem autorização.
- Observatório: dashboard de leitura e observatório nativo no catálogo, sem alterar fontes operacionais. Destinos, unidades, evidência e validade comercial devem conservar valores originais e distinguir informação confirmada de desconhecida.
- Monitoring: serviço separado, autenticado, com gestão de utilizadores, sondas, logs estruturados do portal/IA, histórico de incidentes, backups locais verificáveis, limpeza controlada e tabelas de observabilidade. O portal não tem autenticação própria: identificadores de sessão nos logs não identificam pessoas.
- Operação local: SageMaker Studio com portal (3001), apresentação (3003), monitoring (3004), Observatório (8501) e agente opcional (8000). Existem comandos just blu it (recuperação autenticada) e just blu up (arranque). Isto não equivale a deployment de produção.
- Segurança: não registar prompts, respostas, dados pessoais, segredos nem conteúdo dos formulários na telemetria. Credenciais locais ficam fora do Git; houve exposição histórica de credenciais versionadas, pelo que importa rodar qualquer palavra-passe ainda em uso.

## Distinguir adição, substituição e ranking — 2026-10-16

Concluído: 118 testes do portal aprovados, um ignorado; 16 testes do agente
aprovados; build e navegador em 390/1600 px aprovados. As frases reportadas
foram reproduzidas com catálogo e versões temporários. Sem chamadas pagas ao
modelo; o contrato específico de ranking foi verificado com fornecedor simulado.

## Conclusão funcional das seis fases — 2026-10-16

Pedido: implementar todas as fases antes da ronda de testes e correções.
Não marcar uma fase como validada apenas por concluir a implementação.
Preservar dados reais; os testes finais usam armazenamento temporário e mocks.

Voos dependem de uma API escolhida; não inventar disponibilidade ou reservas.
Deployment, envio de comunicações e chamadas pagas não decorrem desta preparação.

Implementação funcional das seis fases preparada. Validação técnica concluída:
116 testes do portal aprovados, um ignorado; 23 Python; build, catálogo/ETL,
ciclos das APIs com dados temporários e chat/operações em 390/1600 px aprovados.
Portal HTTP 200; operação sem token 401 e autenticada 200. Configuração privada
da sessão em `/tmp/blu-operations.env`, fora do Git e sem impressão do segredo.
Critérios e dependências externas em docs/ASSISTANT_VALIDATION.md. CI apenas
manual; 18 cenários reais por executar no Bedrock com autorização de custos.

## Impacto das propostas do agente — 2026-10-16

Concluído: 107 testes do portal aprovados, um ignorado; build aprovado.
Resumo validado em 390/1600 px com fornecedor simulado e exports temporários.
Abrir os detalhes não cria versões nem chamadas adicionais ao modelo. Sem
chamadas AWS nesta entrega; portal reiniciado com a configuração Nova Pro.

## Avaliação de grounding e injeção — 2026-10-16

Concluído: 11 casos sintéticos e 15 testes do agente aprovados sem chamadas
externas. Corrigido falso positivo para alternativas no dia errado. A nova
bateria ainda não foi executada no Bedrock; não inferir sucesso do modelo.

## Conversa contextual e alternativas — 2026-10-15

Concluído em 2026-10-16: 104 testes do portal aprovados, um ignorado; 13 testes
do agente aprovados; build e UI em 390/1600 px aprovados. UI e persistência usam
mocks e diretórios temporários. Nova Pro passou um cenário real explícito de
refinamento e duas alternativas; os dois testes anteriores com Nova Lite falharam
semanticamente. Conservar o caso e não apresentar esta amostra como avaliação
ampla. Nova Pro passa a predefinido configurável. Fontes e warehouse preservados.

Preservar confirmação humana, catálogo e warehouse. Modelo continua no Bedrock;
testes com fornecedores simulados e armazenamento temporário por defeito.

## Respostas sem ações e confirmação no chat — 2026-10-15

A auditoria revelou uma proposta com ação válida. A pré-visualização estava
antes das mensagens, fora da zona visível após o scroll automático. Corrigir a
ordem no DOM e verificar o botão no viewport, sem o scroll automático do teste.

Check aprovado (100 testes, um ignorado), 11 testes do agente aprovados e build
aprovado. Navegador em 390/1600 px: botão de aceitação no viewport, «ok» não chama
o fornecedor nem apaga a proposta e uma resposta sem ações fica identificada.
Interface validada com mocks em exports temporários, sem alterar viagens reais.

## Origem do portal em execução — 2026-10-15


Portal HTTP 200; pedido vazio com a origem confirmada chega à validação (400),
enquanto uma origem externa continua recusada (403). Sem chamadas ao modelo nesta
verificação. Não foi alterada nenhuma viagem.

Manter a comparação exata de origem; não confiar em qualquer domínio recebido
no pedido para contornar uma configuração errada.

## Correção do envio no chat — 2026-10-15

Check aprovado (99 testes e um ignorado), build aprovado e navegador em
390/1600 px: mensagem visível durante o pedido, erro no chat sem alterar versões,
envios sem duplicação e aceitação/rejeição preservadas. Pedido de remover a primeira
atividade reproduzido pela API e Bedrock reais com dados sintéticos: HTTP 200.
Esta reprodução não identifica o erro específico da sessão do utilizador; agora
o erro fica visível no chat em vez de a mensagem desaparecer.

## Agente AWS — primeira entrega de 2026-10-15

Âmbito inicial: adicionar, substituir, remover, reagendar, reorganizar, capacidade,
períodos livres e dias livres. Operações compostas são validadas integralmente.
Mover entre dias, otimizar percursos pelo agente, editar briefing/confirmações,
feedback, ranking histórico e restantes Fases 2–6 ficam por implementar.
Uma chamada Bedrock com dados sintéticos passou; não usar dados reais nos testes.
Validação: 99 testes Node aprovados, um ignorado; 50 Python aprovados; build,
API com fornecedor simulado e UI em 390/1600 px aprovados. Exports e catálogo
de integração isolados em diretórios temporários. Lambda não publicado.

## Base do assistente — integração de 2026-10-15

O plano específico tem avaliações anteriores à migração; confirmar as premissas
no código. Reutilizar o catálogo Python e as validações do portal. Modelos usam
mocks nesta preparação, sem chamadas pagas.

## Limpeza após migrações — 2026-10-15

Removido `dataset.test.mjs`; testes úteis integrados em infraestrutura e matching.
Retirados comandos `enrich`/`catalog-id` e adaptadores sem consumidores de produção.
95 testes Node aprovados, um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. Fontes e dados operacionais preservados.

## Migração incremental HTML/Python — 2026-10-15

Base: `chore/project-cleanup` em `da8de67`; branch `refactor/html-python`.

Resultados: 101 testes do portal aprovados e um ignorado; 27 testes Python
aprovados; build aprovado. Consulta HTML em 360/1440 px, com e sem JavaScript;
12 cenários de navegação em seis idiomas; briefing em duas larguras; downloads
TXT em três larguras. 24 exportações TXT comparadas byte a byte com a versão
anterior. Exports de navegador num diretório temporário.

Preservar o editor interativo, os contratos das versões, PDFs e tradução.
Python usa a biblioteca padrão e não requer outro serviço nem instalação de
framework. Não converter componentes interativos para HTML estático quando isso
eliminar operações existentes ou exigir uma segunda implementação em JavaScript.

## Continuação HTML/Python — meteorologia

96 testes Node aprovados e um ignorado; 37 Python aprovados; build aprovado.
Popover em 320/1440 px; downloads TXT e ZIP PDF em duas larguras, com e sem JS.
Meteorologia simulada e exports isolados num diretório temporário.

## Continuação HTML/Python — catálogo e histórico

96 testes Node aprovados e um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. 267 identificadores equivalentes. APIs reais com edição,
conflito e publicação em dados temporários; editor em seis idiomas; histórico
com e sem JavaScript em duas larguras.

## Simplificação para a próxima iteração do agente — 2026-10-15

Base: dev em `a4b7626`; branch `chore/project-cleanup`.
Âmbito: limpeza e consolidação, com commits separados por etapa.

Validação: 99 testes do portal aprovados, um ignorado; build aprovado;
20 testes Python e cinco de tradução aprovados; Markdown e ligações locais
sem erros. O CI documental passa a verificar artefactos locais e links.

Todos os módulos TypeScript eram alcançáveis pelas entradas de produção.
Preservar as fronteiras funcionais e os contratos, em vez de juntar módulos
apenas para reduzir a contagem. Fontes Excel/PDF, catálogo, exports e warehouse
ficam preservados. A implementação da próxima iteração do agente está fora
desta entrega.

## Revisão integral do diretório — 2026-10-15

Lockfile de 221 para 148 entradas; a instalação mínima usa nove pacotes e passa
18 testes do ETL. Ambiente completo: 21 testes Python, cinco de tradução e 99 do
portal aprovados, um ignorado; auditoria dos 147 pacotes sem avisos conhecidos.

Preservar as ferramentas do ambiente/IDE, fontes, propostas, backups, modelos
locais e a entrega warehouse usada pelo portal. A montagem EFS sai do Git mas
permanece disponível na instância.

## Fusão dos módulos auxiliares — 2026-10-15

Sete ficheiros passam a três, mantendo a separação cliente/servidor e os mesmos
exports públicos. Registar esta etapa num commit separado.

## Consolidação dos testes — 2026-10-15

As asserções e condições de falha originais foram comparadas automaticamente.
99 testes unitários aprovados e um ignorado; build aprovado; 42 cenários de
interface, stress, dois cenários de briefing e apresentação do itinerário
aprovados numa instância de produção com armazenamento temporário.

## Consola de desenvolvimento no SageMaker

100 testes aprovados e um ignorado; fonte e stack frames HTTP 200.

## Identificação e rótulos dos formulários

Check aprovado (100 testes e um ignorado), build aprovado e briefing validado
em 360 e 1440 px, incluindo edição, revisão e payload.

## Próxima iteração do agente

- [ ] Definir o objetivo, as operações autorizadas e os critérios de aceitação.
- [ ] Rever o serviço existente `src/blu_ai/` e os contratos de domínio do portal.
- [ ] Definir esquemas de ações e validar respostas antes de alterar itinerários.
- [ ] Evitar duplicação de catálogo, regras de curadoria e persistência.
- [ ] Definir fornecedor, custos, privacidade, timeouts e degradação com mocks.
- [ ] Manter confirmação humana, atividades protegidas e versões imutáveis.
- [ ] Validar credenciais e chamadas reais apenas no âmbito autorizado.

Ver [arquitetura e fronteiras](docs/ARCHITECTURE.md).

## Base e qualidade

- [ ] Acrescentar CI do portal; o CI de dados e documentação não cobre o frontend.
- [ ] Automatizar catálogo aprovado → ETL → geração → confirmação → versão → PDF.
- [ ] Definir gates e exceções auditáveis para qualidade e conflitos das fontes.
- [ ] Rever os contratos de entrega, snapshot e retenção do warehouse no CI.

## Entrega e recuperação

- [ ] Rever acesso, consentimento, retenção e revogação das partilhas e do Lixo.
- [ ] Inspecionar PDFs nos idiomas suportados e documentar fontes necessárias.
- [ ] Acrescentar fotografias apenas com autorização e créditos.
- [ ] Testar backup e recuperação de catálogo, histórico e PDFs.
- [ ] Atualizar a instalação do plugin Canva após revisão do pacote-fonte.
- [ ] Validar uma proposta real: TXT → cópia Canva → revisão → PDF final.

## Operação multiutilizador e cloud

- [ ] Definir autenticação, papéis, permissões e sincronização.
- [ ] Definir minimização, retenção, eliminação e logs de dados pessoais.
- [ ] Validar concorrência de catálogo, rascunhos e versões.
- [ ] Definir deployment, segredos, região e recuperação operacional.
- [ ] Aprovar migração ou publicação antes de executar alterações externas.
- [ ] Escolher apenas os fornecedores necessários e definir contratos com mocks.
- [ ] Definir origem S3, retenção e fallback sem acoplar o ETL ao transporte.

## Histórico

As integrações anteriores, os resultados e os limites estão em
[decisões](docs/DECISIONS.md), [testes](docs/TESTING.md) e
[segurança das dependências](docs/DEPENDABOT_PYTHON.md). O histórico completo dos
planos anteriores permanece no Git.

## Observatório de dados BLU — 2026-10-16

Dashboard só de leitura; sem alteração das fontes, catálogo operacional ou warehouse.
Mapa com contornos locais Natural Earth da Europa e norte de África, sem mosaicos externos; coordenadas válidas em intervalo não certificam a
localização. Experiências sem coordenadas continuam pesquisáveis na lista.

### Ferramentas de exploração — 2026-10-16

Validação desta etapa: 51 testes Python aprovados, incluindo sete contratos do
dashboard. AppTest nas seis áreas, comparação, filtros e camadas vazias; navegador
local com cliques em pontos/grupos, comparação, destino Lisboa, apresentação e
vista móvel sem transbordo horizontal. Sem chamadas a IA ou alteração dos dados.

### Conclusão do Observatório — 2026-10-16

Contratos versionados para destinos, âmbito geográfico, unidades e condições;
valores originais preservados. Modelos ETL com evidência por campo, confirmação
vinculada ao valor e validade reavaliada à data da consulta. Metadados opcionais
na fonte definidos no [guia do Observatório](docs/OBSERVATORY.md). Fotografias
locais CC0 de Lisboa e Porto, com créditos, origem e SHA-256.

Na entrega atual, 251 de 252 localizações têm destino harmonizado; o registo
«Por confirmar» continua pendente. Unidades sem base de cobrança explícita e
campos sem evidência comercial continuam desconhecidos; a implementação não
substitui a confirmação pelos responsáveis das fontes. Compatibilidade com o
warehouse existente através do mesmo contrato, sem reescrever dados reais.

Validação final: 66 testes Python aprovados, integração catálogo/ETL aprovada
em armazenamento temporário, seis áreas verificadas em AppTest e navegador
local com seleção, grupos, comparação, destino Lisboa, fotografia, apresentação
e vista móvel sem transbordo. Markdown e ligações locais sem erros. Fontes e
warehouse reais inalterados; sem chamadas pagas ou publicação cloud.

## Preenchimento verificado do warehouse — 2026-10-16
Ver [dados acrescentados e fontes oficiais](docs/DATA_ENRICHMENT.md). A confirmação
de valores públicos não implica reserva, disponibilidade ou tarifa negociada.
Identificações ambíguas, descontos e preços sem fonte continuam pendentes.

Validação: bateria Python com 76 testes aprovados; 34 contratos revalidados
após os reforços de preservação de zeros e preços divergentes. Integração
catálogo/ETL e seis áreas em AppTest aprovadas. Navegador real confirmou
morada, tarifa, evidência e apresentação móvel. ETL publicado com zero erros;
13 revisões correntes correspondem à entrega e os snapshots anteriores foram
comparados sem alterações. Os Excel/PDF e as propostas históricas ficaram intactos.

## Refinamento visual do portal — 2026-10-18

Direção editorial clara, com navegação azul profunda e acentos dourados.
Sem alterações de dados, fornecedores ou publicação.

Validação: check aprovado (95 testes e um ignorado), build de produção aprovado
e 42 cenários de interface nos seis idiomas aprovados, com tradução e dados de
itinerário simulados. Inspeção visual em 390/1440 px sem transbordo; cabeçalho,
campos, etapas e ações revistos. Três traduções portuguesas afinadas após essa
bateria, com nova compilação e verificação de apresentação. Documentação e
`git diff --check` aprovados. Portal local na porta 3001, sem publicação.

## Observatório nativo no catálogo — 2026-10-18

Sem iframe, dependência do Streamlit ou nova persistência.

Validação: check aprovado (97 testes, um ignorado), build aprovado, 83 testes
Python aprovados e integração catálogo/ETL em armazenamento temporário aprovada.
Doze cenários do editor nos seis idiomas aprovados com dados e tradução
simulados. Dashboard nativo verificado com a entrega real em 320/1440 px: seis
áreas, filtros, atualização sem perder destino, comparação, ficha, seleção
por teclado, zoom e agrupamento. Falha analítica e recuperação simuladas, com
formulário preservado sem guardar. Inspeção visual da apresentação final.

`git diff` confirmou ausência de alterações em `dashboard/`, fontes, warehouse,
arranque Streamlit e configuração do proxy. Leitura real: 252 ofertas, 257
referências e 2021 campos de evidência. Sem chamadas a IA ou publicação.

## Legibilidade do mapa e alinhamento dos painéis — 2026-10-18

Validação: check aprovado (97 testes, um ignorado), build aprovado e cenários
do Observatório em 320/1440 px aprovados. As verificações medem alvos de 44 px
antes e depois do zoom, ausência de etiquetas sobre os marcadores e diferença
inferior a 2 px entre painéis adjacentes em ecrã largo. Inspeção visual em
390/1440 px: painéis de 631 px em desktop, alturas adaptáveis em móvel e
contagens de grupos com vários destinos sem atribuição ao primeiro destino.
Tradução e falha de recuperação simuladas; dados analíticos locais só de leitura.
Dashboard original, dados e configuração de arranque preservados.

## Largura comum das páginas — 2026-10-18

Manter a composição funcional do workspace e a coluna de leitura das partilhas.

Validação: `npm run check` com 97 testes aprovados e um ignorado; build aprovado.
Navegador: 48 cenários de interface/navegação em seis idiomas, com comparação
das páginas em 320/1440/1920 px e sem transbordo horizontal. Em 1920 px,
os cinco contentores medidos têm 1440 px e começam em x=240. Tradução e
geração de itinerários simuladas nos cenários aplicáveis. Inspeção visual do
catálogo e briefing em ecrã largo aprovada.

## Contentores responsivos — 2026-10-18

Validação: check aprovado (97 testes e um ignorado), build aprovado e 66
cenários de interface/navegação em seis idiomas. Largura fluida e alinhamento
verificados em 320/768/1024/1440/1920/2560 px, sem transbordo horizontal.
Observatório aprovado em 320/1440 px; tradução e geração simuladas nos
cenários aplicáveis. Dashboard original e dados preservados.

## Limpeza local de artefactos — 2026-10-18

Removidos 426 MiB de artefactos regeneráveis. Portal e dashboard original
respondem HTTP 200 após a limpeza. Verificação da estrutura (340 ficheiros)
e `git diff --check` aprovados. Código, dados, exports e ambientes preservados.

## Tema claro e escuro — 2026-10-18

Validação: check aprovado (97 testes e um ignorado), build aprovado, lint e
formatação finais aprovados. Navegador: 66 cenários responsivos/navegação em
seis idiomas; tema em 320/768/1440/2560 px com persistência, sincronização,
teclado, impressão clara e armazenamento da preferência bloqueado. Contraste
de texto principal, formulário e seletor medido em pelo menos 4,5:1 no modo
escuro após as transições. Observatório aprovado em 320/1440 px. Inspeção
visual do briefing e catálogo em tema escuro aprovada. Tradução e geração
simuladas nos cenários aplicáveis; dashboard, dados e templates PDF intactos.

## Revisão de testes e artefactos — 2026-10-18

Removidos 529,9 MiB: downloads Argos já instalados, cache de compilação
Next.js e capturas Canva regeneráveis. Os seis pares de modelos instalados
foram confirmados pelos metadados. Corrigida também uma expressão sem efeito
no teste de tema que era assinalada pelo lint.

Validação: check aprovado (97 testes e um ignorado), 54 combinações de
interface/navegação aprovadas, temas em quatro larguras aprovados e cinco
testes do worker de tradução aprovados com modelos simulados. Estrutura de
344 ficheiros, Markdown e `git diff --check` aprovados. Portal e dashboard
respondem HTTP 200. Código funcional, dados, exports e modelos preservados.

## Guião de apresentação interativa — 2026-10-18

Validação: ligações locais do novo guião, Markdown, verificação da estrutura
e `git diff --check` aprovados. Alteração apenas documental; sem execução de
serviços externos, alteração de dados ou implementação da apresentação.

## Dashboard de apresentação independente — 2026-10-18

Validação: percurso completo em 320/768/1440/2560 px aprovado, incluindo
escolha refletida no roteiro, pontos do mapa com alvos de 48 px, alteração
reversível, navegação por teclado e fallback de ecrã inteiro. Sem chamadas
externas/API, sem escrita no localStorage e sem erros JavaScript. Caminhos
diretos e com prefixo Studio, com/sem barra final, aprovados localmente.
Inspeção visual das três cenas e do mapa móvel concluída. JS/Python, Markdown,
estrutura e `git diff --check` aprovados. Portal e Streamlit mantêm os mesmos
processos e HTTP 200; não houve build, restart ou alterações aos seus ficheiros.
O acesso autenticado pelo proxy AWS real não foi validado pelo navegador local.

## Continuação da apresentação — 2026-10-18

Validação: oito capítulos aprovados em 320/768/1440/2560 px, incluindo
fluxo de dados, pedido bloqueado sem alteração, ajuste permitido, comparação
de exemplos de versões, arquitetura e resumo final. O CTA final corresponde
exatamente ao URL indicado e abre um novo separador com `noopener`. Sem
visitar o destino real, chamadas a APIs, escrita no navegador ou erros JS.
Inspeção visual das novas cenas concluída. Sintaxe JS, documentação, Markdown
e `git diff --check` aprovados; serviços e ficheiros do portal intactos.

## Guião técnico em três partes — 2026-10-18

Na revisão documental inicial, a implementação visual ficou pendente;
ver a conclusão do ato técnico abaixo.

Revisão concluída em 2026-10-19: ligações locais, Markdown, estrutura do
projeto e `git diff --check` aprovados. Quatro esquemas Mermaid incluídos.
Alteração apenas documental; a abertura técnica ainda está proposta no guião.

## Ato técnico com animações explicativas — 2026-10-19

Validação em 2026-10-19: cinco cenas técnicas e oito narrativas aprovadas em
320/768/1440/2560 px, com teclado, navegação entre partes, falha ilustrativa
de publicação e preservação das escolhas. Ligações animadas, pausa manual e
movimento reduzido verificados; movimento efetivo do registo entre etapas
confirmado no navegador. Sem chamadas a APIs/fornecedores, escrita em
localStorage ou erros JS. Inspeção visual da abertura técnica concluída.
JS, Markdown, estrutura e `git diff --check` aprovados. Apenas a apresentação
independente foi iniciada; código e dados do portal/Streamlit intactos.

## Base pública dos dashboards — 2026-10-19


Validação: seis testes de infraestrutura/origens aprovados, sintaxe dos dois
arranques shell aprovada e URLs gerados iguais à base indicada. Os três
serviços foram reiniciados com a configuração correta e respondem HTTP 200
localmente. Markdown, estrutura e `git diff --check` aprovados. Sem build,
alteração de dados ou renovação automática da sessão AWS.

## Onboarding reproduzível — 2026-10-19

- [ ] Validar o percurso completo num segundo espaço SageMaker com uma identidade
  IAM distinta e confirmar o acesso Bedrock real.

## Auditoria editorial e detalhe técnico — 2026-10-19


Validação: seis cenas técnicas e seis narrativas aprovadas em
320/768/1440/2560 px, incluindo as sete áreas de tecnologias e os seus
aprofundamentos. Navegação, teclado, escolhas, movimento reduzido, pausa e
movimento efetivo do registo verificados no navegador. Sem chamadas externas,
escrita em localStorage ou erros JS. Inspeção visual das tecnologias, entrega
e fecho concluída. Sintaxe JS, Markdown, estrutura e `git diff --check`
aprovados. Portal, dashboard original e dados sem alterações. Valores dos
manifests e predefinições de código não são apresentados como medições ou
configuração efetiva dos serviços.

## Grelha dos seis capítulos — 2026-10-19


Grelha, seis botões e contador `/ 06` verificados em 320/768/1440/2560 px,
na técnica e na curadoria. Estrutura e `git diff --check` aprovados.

## Limpeza local do diretório — 2026-10-19


Âmbito: caches npm/pip, entradas uv sem referência e `__pycache__` do
projeto. Preservar ambientes, dependências instaladas, builds em utilização,
navegadores de teste, configurações SageMaker, dados e histórico Git.
O relatório de dados e `presentation/dist` têm referências e uso confirmado.

Resultado: removidos cerca de 1,1 GB de caches npm/pip e entradas uv sem
referência (128,1 MiB no uv), além de dois diretórios de bytecode. Mantidas
as restantes entradas uv para reinstalação e funcionamento sem rede.
Portal `/catalog`, apresentação e saúde Streamlit respondem HTTP 200.
Estrutura (356 ficheiros) e `git diff --check` aprovados; só este plano
foi alterado entre os ficheiros versionados. Nenhum teste foi removido.

## Monitoring e deployment — 2026-10-19

Branch `feat/monitoring-deployment`, criado a partir de `dev` em `aa385fd`,
com diretório limpo. Proposta em [monitoring e deployment](docs/OPERATIONS.md).

- [ ] Definir ambiente-alvo, utilizadores, disponibilidade e orçamento.
- [ ] Corrigir e validar empacotamento Node/Python num ambiente isolado.
- [ ] Definir persistência, backups consistentes e ensaio de restauro.
- [ ] Instrumentar saúde, logs, métricas e alertas com dados minimizados.
- [ ] Preparar CI, staging, promoção e rollback da aplicação e dos dados.

Nesta fase não foram criados recursos cloud, pipelines de publicação ou
chamadas a modelos. A implementação depende das decisões do desenho inicial.

### Desenho e alternativas — 2026-10-19

O utilizador escolheu desenhar a arquitetura e comparar alternativas antes de
implementar.

- [ ] Recolher requisitos de operação e fechar uma decisão fundamentada.

A VM é uma hipótese preliminar, não uma plataforma já escolhida. Sem criação
de infraestrutura, alteração de serviços, custos ou publicação.

### Painel independente com login — 2026-10-19


Credenciais e registos operacionais ficam locais e fora do Git. Nesta primeira
versão, os logs são das sondas; não existe ainda instrumentação de todos os
pedidos do portal ou recolha de traces.

Validação: dez testes Python aprovados com fixtures temporárias e quatro
cenários de navegador em 320/768/1440/2560 px. Verificados login inválido/válido,
API sem sessão, cookies, origem, CSRF, expiração, rate limit, logout, bloqueio
de ficheiros privados, redirects das sondas, recolha atrasada e falha de ligação.
Inspeção visual desktop/mobile concluída. Recolha local real confirmou os três
serviços existentes disponíveis e agente desativado; API monitoring sem login
responde 401. Não foram testados o proxy HTTPS com a sessão do utilizador nem
fornecedores externos.

### Acesso pelo proxy do monitoring — 2026-10-19


Evidência: proxy local na porta 8888 responde 200 para 3001/3003 e 400 para
3004; código instalado do proxy verifica a sua lista de portas permitidas.
Não foi alterada a lista através de interfaces internas não documentadas.

Confirmação do utilizador em 2026-10-19: a página passou a abrir depois do
encaminhamento. Esta confirmação cobre o acesso à página; o login real e a
navegação autenticada pelo proxy ainda não foram confirmados pelo utilizador.

## Pendências de monitoring

Registado a pedido do utilizador em 2026-10-19. A recolha interna, backups locais e
consumo de IA foram implementados. A operação externa continua incompleta enquanto
não existirem destinos, responsáveis e infraestrutura fora desta máquina.

- [ ] Configurar notificações externas de incidentes: canal, destinatários,
  limiares, deduplicação e recuperação. Validar o fluxo; envios reais exigem
  autorização aplicável do utilizador.

Ao retomar monitoring ou preparar deployment/produção, recordar a pendência externa
desta lista e as duas pendências de produção registadas abaixo. Manter cada item
aberto até existir implementação e evidência de validação; a existência de um plano
ou de um painel não basta.

### Implementação da segunda etapa — 2026-10-19

Implementado com eventos JSON-lines limitados a 2 MB, agregação das últimas 24
horas, cópia SQLite consistente, manifestos SHA-256, restauro isolado e fila local
de abertura/recuperação. O envio externo continua pendente: falta definir canal,
destinatários, credenciais e limiares antes de o ativar.

## Gestão de utilizadores do monitoring — 2026-10-19

Esta tarefa de utilizadores não cobriu os sinais operacionais. A implementação
posterior resolveu erros internos, backups e consumo de IA; o envio externo de
notificações continua pendente.

Validação: 18 testes Python e gestão completa de contas no navegador em
320/768/1440/2560 px aprovados. Cobrem migração legada sem alterar o hash,
persistência, recuperação CLI sem apagar outras contas, falha de disco sem
aplicação parcial, autorização e CSRF, revogação de sessões e concorrência
entre administradores. Inspeção visual desktop/mobile concluída.

A regra de exclusão do runtime estava comentada e os ficheiros tinham sido
versionados. Regra reativada, ficheiros retirados do índice e verificação
estrutural acrescentada contra nova inclusão. O histórico não foi reescrito.

- [ ] Alterar a palavra-passe inicial através da nova página caso ainda esteja
  em uso, pois constou de um commit anterior.

## Portas do Code Editor — 2026-10-19

A porta 8000 permanece fora da lista principal porque o agente é opcional e não
está em execução. Pode ser encaminhada quando `BLU_START_AGENT=1` for usado.

## Limpeza automática pelo monitoring — 2026-10-19

## Normalização de indentação — 2026-10-19

Foram formatados os cinco HTML versionados, CSS de portal, monitoring e dashboard,
JavaScript de monitoring e testes e configurações que o verificador assinalou. O
warehouse e os restantes dados publicados não foram alterados. Validação: 83 testes
Python, 97 testes do portal com um opcional omitido, lint e tipos do portal, e
cenários de navegador do monitoring e apresentação em 320–2560 px aprovados.

## Preparação do monitoring para deployment — 2026-10-19
- [ ] Configurar destino externo cifrado para backups no ambiente escolhido.
- [ ] Instalar uma sonda fora da máquina e ligar notificações a responsáveis reais.


## Observabilidade centralizada no Monitoring — 2026-10-19


O portal não possui autenticação própria: o campo de utilizador identifica apenas a
sessão efémera do separador ou execução no servidor, sem atribuir ações a uma pessoa.
As notificações externas, o backup externo cifrado e a sonda externa permanecem nas
pendências de produção acima.
