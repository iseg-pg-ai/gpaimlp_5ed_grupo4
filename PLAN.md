# Plano de evolução do BLU AI System

## Integração de monitoring neste branch — 2026-10-22

- [x] Integrar monitoring preservando o fluxo transacional da Fase 2.
- [x] Validar Python, monitoring, portal, catálogo/ETL e documentação.

## Integração transacional do assistente — Fase 2, 2026-10-21

Autorizada pelo proprietário após a entrega da Fase 1. Trabalho em cópia isolada,
com aplicação ao original apenas depois de validar e confirmar os ficheiros.
Esta secção prevalece sobre os relatos históricos de outras branches abaixo.

- [x] Fixar contrato partilhado das onze operações de itinerário e PT/EN.
- [x] Ligar planeador Bedrock ao portal sem execução implícita no chat.
- [x] Pré-visualizar, aceitar ou rejeitar com validação e auditoria transacional.
- [x] Preservar proteções, versões e dados de confirmação manual.
- [x] Concluir testes locais, navegador e revisão independente.
- [x] Aplicar ficheiros verificados ao original e entregar evidências da Fase 2.
- [ ] Obter aprovação separada antes da Fase 3 e das chamadas reais ao modelo.

Evidências locais: 117 testes Python e 138 testes do portal aprovados; lint,
tipos, formatação, build, catálogo/ETL, Markdown e estrutura/links aprovados.
Os 48 testes específicos cobrem ações, proteções, concorrência e rollback.
Ciclo HTTP PT/EN aprovado com fornecedor local simulado, incluindo controlos
manuais, falhas, esclarecimento, rejeição, aceitação e conflitos. Navegador
aprovado em 390/1600 px e PT/EN, incluindo duplo clique e troca de viagem.
Trinta testes Python específicos aprovados e 34 casos reais apenas listados.
Sem AWS real, deployment, novos pacotes, commits ou alterações a dados.

TXT mantém o formato atual para o Canva, conforme decisão do proprietário.
Não integrar ranking, feedback, recuperação de casos, proatividade, alterações
ao briefing/catálogo/confirmações ou deployment. Contrato em docs/ASSISTANT.md.

Plano consolidado em 20 de outubro de 2026. Mantém apenas trabalho aberto e
condições que afetam decisões futuras. O histórico de implementação permanece no
Git e em [docs/DECISIONS.md](docs/DECISIONS.md).

## Estado a preservar

- O portal gere catálogo, itinerários, confirmações, versões e entregas.
- O ETL publica o warehouse sem alterar as fontes; testes usam cópias temporárias.
- Catálogo e validações determinísticas são a fonte de verdade. A IA propõe ações
  sujeitas a validação e confirmação humana.
- Informação desconhecida não significa compatibilidade, disponibilidade ou preço
  zero. Custos, pendências e moedas permanecem separados.
- O Observatório consulta a entrega publicada sem escrever no warehouse.
- O Monitoring tem autenticação local, gestão de utilizadores, sondas, eventos,
  incidentes, backups locais e limpeza conservadora. O portal continua sem
  autenticação própria.
- `just blu up` arranca o ambiente preparado; `just blu it` executa recuperação
  local autenticada. Nenhum dos comandos equivale a deployment de produção.
- Num clone sem estado operacional nem backups, `just blu it` inicializa o catálogo
  a partir do warehouse versionado e cria a estrutura vazia de itinerários. Estado
  parcial ou inválido continua a exigir recuperação por backup.
- Segredos, dados de clientes, prompts, respostas, exports e runtimes ficam fora
  do Git e dos logs.

## Onboarding e qualidade

- [ ] Validar o onboarding completo num segundo espaço SageMaker, com identidade
  IAM distinta e acesso Bedrock real autorizado. Incluir o fluxo documentado com
  `--initialize-data`, sem copiar contas, catálogo ou exports da máquina original.
- [ ] Acrescentar CI do portal para `npm run check` e `npm run build`.
- [ ] Automatizar em ambiente isolado o fluxo catálogo aprovado → ETL → geração →
  confirmação → versão → PDF.
- [ ] Definir gates e exceções auditáveis para qualidade e conflitos das fontes.
- [ ] Rever retenção e compatibilidade das entregas publicadas no CI.
- [ ] Continuar a migração incremental do portal: mover ordenação de percursos e
  resumos para Python antes de retirar o adaptador TypeScript correspondente.

## Agente de IA

- [ ] Definir objetivo, operações autorizadas e critérios de aceitação da próxima
  iteração.
- [ ] Rever `src/blu_ai/` e reutilizar os contratos de domínio do portal.
- [ ] Validar esquemas de ações antes de alterar itinerários.
- [ ] Preservar confirmação humana, atividades protegidas e versões imutáveis.
- [ ] Definir fornecedor, custos, privacidade, timeouts e degradação.
- [ ] Usar mocks por defeito; chamadas reais exigem autorização e credenciais.

## Entrega e recuperação

- [ ] Rever acesso, consentimento, retenção e revogação das partilhas e do Lixo.
- [ ] Inspecionar PDFs nos idiomas suportados e documentar fontes necessárias.
- [ ] Acrescentar fotografias apenas com autorização e créditos.
- [ ] Validar uma proposta real: TXT → cópia Canva → revisão → PDF final.
- [ ] Rever o pacote-fonte antes de atualizar uma instalação do plugin Canva.

## Operação multiutilizador e cloud

- [ ] Definir ambiente-alvo, utilizadores, identidade, papéis e permissões.
- [ ] Definir disponibilidade, perda de dados e tempo de recuperação aceitáveis.
- [ ] Validar concorrência do catálogo, rascunhos e versões.
- [ ] Definir minimização, retenção e eliminação de dados pessoais.
- [ ] Escolher hosting, persistência, segredos, região, staging e rollback.
- [ ] Definir origem S3 e fallback sem acoplar o ETL ao transporte.
- [ ] Aprovar qualquer criação de infraestrutura, custo ou publicação externa.

A comparação de alternativas e os limites atuais estão em
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Pendências de monitoring

A recolha interna, consumo de IA, incidentes e backups locais estão implementados.
O Monitoring continua incompleto para produção até existirem:

- [ ] notificações externas com canal, destinatários, limiares, deduplicação e
  recuperação validados;
- [ ] destino externo cifrado para backups e política de retenção;
- [ ] sonda executada fora da máquina, ligada a responsáveis reais.

Envios reais e infraestrutura externa exigem autorização aplicável. Não encerrar
uma pendência apenas porque existe um plano ou painel; é necessária implementação
e evidência de validação.

## Referências

- [Arquitetura](docs/ARCHITECTURE.md)
- [Operações](docs/OPERATIONS.md)
- [Testes](docs/TESTING.md)
- [Decisões](docs/DECISIONS.md)
- [Segurança das dependências](docs/DEPENDABOT_PYTHON.md)

## Plano anterior preservado — 2026-10-22

Registo histórico deste branch. O estado atual de monitoring e as condições
da Fase 2 estão nas secções ativas acima. Não reabrir fases nem chamadas reais
com base nos relatos históricos seguintes.

### Plano de evolução do BLU AI System

#### Integração transacional do assistente — Fase 2, 2026-10-21

Autorizada pelo proprietário após a entrega da Fase 1. Trabalho em cópia isolada,
com aplicação ao original apenas depois de validar e confirmar os ficheiros.
Esta secção prevalece sobre os relatos históricos de outras branches abaixo.

- [x] Fixar contrato partilhado das onze operações de itinerário e PT/EN.
- [x] Ligar planeador Bedrock ao portal sem execução implícita no chat.
- [x] Pré-visualizar, aceitar ou rejeitar com validação e auditoria transacional.
- [x] Preservar proteções, versões e dados de confirmação manual.
- [x] Concluir testes locais, navegador e revisão independente.
- [x] Aplicar ficheiros verificados ao original e entregar evidências da Fase 2.
- [ ] Obter aprovação separada antes da Fase 3 e das chamadas reais ao modelo.

Evidências locais: 117 testes Python e 138 testes do portal aprovados; lint,
tipos, formatação, build, catálogo/ETL, Markdown e estrutura/links aprovados.
Os 48 testes específicos cobrem ações, proteções, concorrência e rollback.
Ciclo HTTP PT/EN aprovado com fornecedor local simulado, incluindo controlos
manuais, falhas, esclarecimento, rejeição, aceitação e conflitos. Navegador
aprovado em 390/1600 px e PT/EN, incluindo duplo clique e troca de viagem.
Trinta testes Python específicos aprovados e 34 casos reais apenas listados.
Sem AWS real, deployment, novos pacotes, commits ou alterações a dados.

TXT mantém o formato atual para o Canva, conforme decisão do proprietário.
Não integrar ranking, feedback, recuperação de casos, proatividade, alterações
ao briefing/catálogo/confirmações ou deployment. Contrato em docs/ASSISTANT.md.

#### Preparação da base para o piloto transacional — 2026-10-21

Fase 1 autorizada pelo proprietário após diagnóstico na cópia isolada em D:.
Base f280971; preservar a evolução existente e não integrar ainda a branch do
novo assistente. Sem chamadas Bedrock, publicação ou alteração de fontes.

- [x] Corrigir fecho SQLite dos testes Windows e repetir os cenários afetados.
- [x] Demonstrar a causa do erro de publicação ETL, corrigir e verificar rollback.
- [x] Reproduzir instalação estável de todos os grupos Python pelo lock existente.
- [x] Tornar os testes de rotas independentes do serviço público OSRM.
- [x] Atualizar README e explicação ao proprietário, verificando links locais.
- [x] Executar checks conjuntos, rever o diff e aplicar apenas ficheiros validados.
- [x] Entregar base preparada; Fase 2 autorizada pelo proprietário.

Validação da base corrigida: 92 testes Python aprovados (191 s), 100 testes do
portal e lint/tipos/formatação aprovados, catálogo/ETL aprovado e cinco testes
de tradução simulada aprovados. Smoke Streamlit Panorama/Qualidade aprovado,
com bytes do warehouse preservados. Estrutura/links, Markdown e diff verificados.
Instalação Python de todos os grupos repetida com sucesso sem alterar o lock.
Não foi repetido o build Next.js aprovado na Fase 0, porque as alterações do
portal nesta fase limitam-se a testes. Sem tradução real, Bedrock ou deployment.
Os testes reais de tradução/Bedrock e a meta de 90% por operação/idioma continuam
por validar na fase própria. A exceção de metadata Argos/Stanza mantém-se; não
alterar o override de segurança para silenciar a verificação de metadata.

#### Atualização local do grafo Graphify — 2026-10-21

- [x] Reconstruir o grafo de código e documentação, excluindo fontes protegidas e dados operacionais: 246 ficheiros, 1344 nós, 2810 relações e 92 comunidades.
- [x] Gerar JSON, relatório e HTML; integridade final e consulta local aprovadas. Diagnóstico: 479 relações com símbolos sem nó excluídas e 46 relações agregadas no formato não dirigido.
- [x] Registar resultados e limitações, sem publicação nem fornecedores externos. `git diff --check` aprovado; Markdownlint indisponível offline e `check_project.py` não executado por falta de Python 3.12/3.13.

#### Integração de dev nas instruções — 2026-10-21

- [x] Integrar `origin/dev` preservando os planos e as orientações anteriores.
- [x] Validar documentação, Python, portal e catálogo/ETL.

Validação local: 83 testes Python; check do portal com 97 aprovados e um
ignorado; build, catálogo/ETL, estrutura e Markdown aprovados. Código funcional
igual a dev; não foram repetidos cenários de navegador nesta integração.

#### Integração de dev em TXT/Canva — 2026-10-21

- [x] Integrar `origin/dev` preservando as melhorias de TXT e do plugin Canva.
- [x] Validar Python, portal, catálogo/ETL e exportação TXT.

Validação local: 83 testes Python; check do portal com 97 aprovados e um
ignorado; build e catálogo/ETL aprovados. Navegador: TXT/Canva em
320/390/1440 px e temas em 320/768/1440/2560 px, com dados temporários.

Registos do assistente acrescentados em 2026-10-16 a partir do plano fornecido
pelo utilizador. As dez secções seguintes conservam o estado e a evidência
reportados no contexto de `pc/assistant-agent-for-blu-curator`; a sua inclusão
documental não integra esse código em `feat/data-modelling-basis` nem revalida
os resultados. Referências a serviços em execução, configuração em `/tmp/` e
documentos específicos do assistente pertencem à sessão e ao branch de origem;
não demonstram disponibilidade neste checkout. As tarefas gerais pendentes e
o trabalho do dashboard são preservados.

#### Distinguir adição, substituição e ranking — 2026-10-16

- [x] Reproduzir o pedido de adição e a correção explícita com a grafia reportada.
- [x] Apresentar apenas opções de adição viáveis para pedidos genéricos.
- [x] Recusar ações que contrariem a intenção explícita antes de propor/aceitar.
- [x] Reduzir o contrato Bedrock ao pedido de ranking ou adição.
- [x] Corrigir mensagens, validar regressões e atualizar o portal.

Concluído: 118 testes do portal aprovados, um ignorado; 16 testes do agente
aprovados; build e navegador em 390/1600 px aprovados. As frases reportadas
foram reproduzidas com catálogo e versões temporários. Sem chamadas pagas ao
modelo; o contrato específico de ranking foi verificado com fornecedor simulado.

#### Conclusão funcional das seis fases — 2026-10-16

Pedido: implementar todas as fases antes da ronda de testes e correções.
Não marcar uma fase como validada apenas por concluir a implementação.
Preservar dados reais; os testes finais usam armazenamento temporário e mocks.

- [x] Fase 0: contratos completos, contexto minimizado e registo de operação.
- [x] Fase 1: mover entre dias, otimização validada, briefing e confirmações assistidos.
- [x] Fase 2: ranking explicável de candidatos e diagnóstico da proposta.
- [x] Fase 3: conclusão da viagem, questionário completo e alertas do catálogo.
- [x] Fase 4: recuperação de casos revistos, sem dados pessoais nem embeddings.
- [x] Fase 5: alertas, regeneração parcial e preparação de comunicações.
- [x] Fase 6: métricas, rejeições, custos configuráveis e qualidade da entrega.
- [x] Atualizar o plano específico e preparar os cenários de validação das seis fases.
- [x] Só após a implementação: executar testes, corrigir falhas e verificar o portal.

Voos dependem de uma API escolhida; não inventar disponibilidade ou reservas.
Deployment, envio de comunicações e chamadas pagas não decorrem desta preparação.

Implementação funcional das seis fases preparada. Validação técnica concluída:
116 testes do portal aprovados, um ignorado; 23 Python; build, catálogo/ETL,
ciclos das APIs com dados temporários e chat/operações em 390/1600 px aprovados.
Portal HTTP 200; operação sem token 401 e autenticada 200. Configuração privada
da sessão em `/tmp/blu-operations.env`, fora do Git e sem impressão do segredo.
Critérios e dependências externas em docs/ASSISTANT_VALIDATION.md. CI apenas
manual; 18 cenários reais por executar no Bedrock com autorização de custos.

#### Impacto das propostas do agente — 2026-10-16

- [x] Calcular diferenças de atividades, horários, ordem e capacidade no servidor.
- [x] Reutilizar o orçamento existente, separando moedas e valores pendentes.
- [x] Apresentar o resumo nas propostas e na seleção de alternativas.
- [x] Validar domínio, interface, build e atualizar o plano específico.

Concluído: 107 testes do portal aprovados, um ignorado; build aprovado.
Resumo validado em 390/1600 px com fornecedor simulado e exports temporários.
Abrir os detalhes não cria versões nem chamadas adicionais ao modelo. Sem
chamadas AWS nesta entrega; portal reiniciado com a configuração Nova Pro.

#### Avaliação de grounding e injeção — 2026-10-16

- [x] Alargar os casos sintéticos a ambiguidade, proteções e dados maliciosos.
- [x] Exigir contrato completo e correspondência exata de ações e alternativas.
- [x] Permitir inspeção offline e seleção de casos antes de chamadas pagas.
- [x] Testar falsos positivos da avaliação e documentar os limites.

Concluído: 11 casos sintéticos e 15 testes do agente aprovados sem chamadas
externas. Corrigido falso positivo para alternativas no dia errado. A nova
bateria ainda não foi executada no Bedrock; não inferir sucesso do modelo.

#### Conversa contextual e alternativas — 2026-10-15

- [x] Transmitir contexto recente limitado à viagem e proposta corrente validada.
- [x] Acrescentar alternativas estruturadas ao contrato partilhado.
- [x] Validar substituições com o catálogo e a lógica determinística existentes.
- [x] Preparar a alternativa escolhida sem inferência adicional nem escrita imediata.
- [x] Validar contexto, opções, proteções, concorrência, UI e documentação.

Concluído em 2026-10-16: 104 testes do portal aprovados, um ignorado; 13 testes
do agente aprovados; build e UI em 390/1600 px aprovados. UI e persistência usam
mocks e diretórios temporários. Nova Pro passou um cenário real explícito de
refinamento e duas alternativas; os dois testes anteriores com Nova Lite falharam
semanticamente. Conservar o caso e não apresentar esta amostra como avaliação
ampla. Nova Pro passa a predefinido configurável. Fontes e warehouse preservados.

Preservar confirmação humana, catálogo e warehouse. Modelo continua no Bedrock;
testes com fornecedores simulados e armazenamento temporário por defeito.

#### Respostas sem ações e confirmação no chat — 2026-10-15

A auditoria revelou uma proposta com ação válida. A pré-visualização estava
antes das mensagens, fora da zona visível após o scroll automático. Corrigir a
ordem no DOM e verificar o botão no viewport, sem o scroll automático do teste.

- [x] Explicitar quando uma resposta textual não contém ações para aplicar.
- [x] Tratar «ok» sem nova inferência e preservar a proposta pendente.
- [x] Separar formato inválido, permissões, ligação, timeout e indisponibilidade.
- [x] Colocar a pré-visualização após as mensagens, junto da resposta mais recente.
- [x] Validar os novos caminhos e reiniciar o portal com Bedrock real.

Check aprovado (100 testes, um ignorado), 11 testes do agente aprovados e build
aprovado. Navegador em 390/1600 px: botão de aceitação no viewport, «ok» não chama
o fornecedor nem apaga a proposta e uma resposta sem ações fica identificada.
Interface validada com mocks em exports temporários, sem alterar viagens reais.

#### Origem do portal em execução — 2026-10-15

- [x] Identificar a recusa: domínio configurado no arranque diferente do navegador.
- [x] Reiniciar com a origem confirmada pelo utilizador e verificar a barreira de origem.

Portal HTTP 200; pedido vazio com a origem confirmada chega à validação (400),
enquanto uma origem externa continua recusada (403). Sem chamadas ao modelo nesta
verificação. Não foi alterada nenhuma viagem.

Manter a comparação exata de origem; não confiar em qualquer domínio recebido
no pedido para contornar uma configuração errada.

#### Correção do envio no chat — 2026-10-15

- [x] Guardar imediatamente a mensagem enviada, mesmo quando o pedido falha.
- [x] Apresentar o erro no próprio chat, preservando roteiro e versões.
- [x] Validar falhas, sucesso e persistência no navegador e reiniciar o portal.

Check aprovado (99 testes e um ignorado), build aprovado e navegador em
390/1600 px: mensagem visível durante o pedido, erro no chat sem alterar versões,
envios sem duplicação e aceitação/rejeição preservadas. Pedido de remover a primeira
atividade reproduzido pela API e Bedrock reais com dados sintéticos: HTTP 200.
Esta reprodução não identifica o erro específico da sessão do utilizador; agora
o erro fica visível no chat em vez de a mensagem desaparecer.

#### Agente AWS — primeira entrega de 2026-10-15

- [x] Confirmar IAM Role e perfil Nova Lite em eu-west-1 sem credenciais fixas.
- [x] Implementar contrato partilhado e propostas estruturadas via Bedrock Converse.
- [x] Reutilizar validação determinística e candidatos aprovados do portal.
- [x] Implementar pré-visualização, aceitação, rejeição e versão com auditoria atómica.
- [x] Reduzir contexto pessoal, remover logs do pedido e bloquear raciocínio interno.
- [x] Restringir o serviço HTTP legado com token e sem CORS público.
- [x] Preparar entrada Lambda privada e template SAM, sem deployment automático.
- [x] Concluir testes unitários, build, navegador e documentação desta entrega.

Âmbito inicial: adicionar, substituir, remover, reagendar, reorganizar, capacidade,
períodos livres e dias livres. Operações compostas são validadas integralmente.
Mover entre dias, otimizar percursos pelo agente, editar briefing/confirmações,
feedback, ranking histórico e restantes Fases 2–6 ficam por implementar.
Uma chamada Bedrock com dados sintéticos passou; não usar dados reais nos testes.
Validação: 99 testes Node aprovados, um ignorado; 50 Python aprovados; build,
API com fornecedor simulado e UI em 390/1600 px aprovados. Exports e catálogo
de integração isolados em diretórios temporários. Lambda não publicado.

#### Base do assistente — integração de 2026-10-15

- [x] Atualizar referências e selecionar `pc/assistant-agent-for-blu-curator`.
- [x] Integrar `refactor/html-python`, preservando também a sua entrega completa
  de `warehouse/`, conforme correção explícita do utilizador.
- [x] Rever o serviço existente e `BLU_ASSISTANT_PLAN.md`.
- [x] Validar a base integrada antes de implementar as Fases 0 e 1.
- [x] Propor ações estruturadas, pré-visualizar e confirmar antes de aplicar.

O plano específico tem avaliações anteriores à migração; confirmar as premissas
no código. Reutilizar o catálogo Python e as validações do portal. Modelos usam
mocks nesta preparação, sem chamadas pagas.

#### Limpeza após migrações — 2026-10-15

- [x] Remover adaptadores e operações sem consumidores de produção.
- [x] Consolidar testes úteis e retirar cobertura duplicada entre Node e Python.
- [x] Validar portal, Python e integração ETL; atualizar referências.

Removido `dataset.test.mjs`; testes úteis integrados em infraestrutura e matching.
Retirados comandos `enrich`/`catalog-id` e adaptadores sem consumidores de produção.
95 testes Node aprovados, um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. Fontes e dados operacionais preservados.

#### Migração incremental HTML/Python — 2026-10-15

Base: `chore/project-cleanup` em `da8de67`; branch `refactor/html-python`.

- [x] Centralizar leitura, pesquisa e enriquecimento das fontes em Python.
- [x] Substituir estado e fetch do explorador por formulário HTML no servidor.
- [x] Mover a preparação das referências históricas para Python.
- [x] Migrar a composição TXT/Canva para Python mantendo regras de domínio partilhadas.
- [x] Validar APIs, erros, escaping, navegação sem JavaScript e idiomas.
- [x] Atualizar arquitetura e comandos, com commits separados por etapa.

Resultados: 101 testes do portal aprovados e um ignorado; 27 testes Python
aprovados; build aprovado. Consulta HTML em 360/1440 px, com e sem JavaScript;
12 cenários de navegação em seis idiomas; briefing em duas larguras; downloads
TXT em três larguras. 24 exportações TXT comparadas byte a byte com a versão
anterior. Exports de navegador num diretório temporário.

Preservar o editor interativo, os contratos das versões, PDFs e tradução.
Python usa a biblioteca padrão e não requer outro serviço nem instalação de
framework. Não converter componentes interativos para HTML estático quando isso
eliminar operações existentes ou exigir uma segunda implementação em JavaScript.

#### Continuação HTML/Python — meteorologia

- [x] Migrar coordenadas, códigos WMO, previsão e fallback histórico para Python.
- [x] Manter o navegador como consumidor da API do portal, com cache e falhas explícitas.
- [x] Substituir a abertura/fecho do painel por popover HTML nativo.
- [x] Migrar os downloads do histórico para formulário HTML sem estado React.
- [x] Reutilizar a meteorologia Python na ferramenta do agente.
- [x] Validar fornecedor simulado, indisponibilidade, histórico, cache e navegação.
- [x] Atualizar arquitetura e evidência com commits separados.

96 testes Node aprovados e um ignorado; 37 Python aprovados; build aprovado.
Popover em 320/1440 px; downloads TXT e ZIP PDF em duas larguras, com e sem JS.
Meteorologia simulada e exports isolados num diretório temporário.

#### Continuação HTML/Python — catálogo e histórico

- [x] Migrar a persistência do catálogo para SQLite Python, preservando o esquema.
- [x] Adaptar APIs e testes para operações assíncronas e validar conflitos.
- [x] Centralizar publicação e leitura do catálogo elegível em Python.
- [x] Converter a ação de Lixo no histórico para formulário HTML.
- [x] Validar bases temporárias, ETL, APIs e navegação sem JavaScript.
- [x] Atualizar documentação e CI com commits separados.

96 testes Node aprovados e um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. 267 identificadores equivalentes. APIs reais com edição,
conflito e publicação em dados temporários; editor em seis idiomas; histórico
com e sem JavaScript em duas larguras.

#### Simplificação para a próxima iteração do agente — 2026-10-15

Base: dev em `a4b7626`; branch `chore/project-cleanup`.
Âmbito: limpeza e consolidação, com commits separados por etapa.

- [x] Inventariar os 345 ficheiros versionados e analisar os imports do portal.
- [x] Remover artefactos locais, placeholders e experiências sem consumidores.
- [x] Consolidar documentação, prompt duplicado e módulo de tradução.
- [x] Atualizar exclusões, verificar referências e concluir a validação.

Validação: 99 testes do portal aprovados, um ignorado; build aprovado;
20 testes Python e cinco de tradução aprovados; Markdown e ligações locais
sem erros. O CI documental passa a verificar artefactos locais e links.

Todos os módulos TypeScript eram alcançáveis pelas entradas de produção.
Preservar as fronteiras funcionais e os contratos, em vez de juntar módulos
apenas para reduzir a contagem. Fontes Excel/PDF, catálogo, exports e warehouse
ficam preservados. A implementação da próxima iteração do agente está fora
desta entrega.

#### Revisão integral do diretório — 2026-10-15

- [x] Inventariar recursivamente o diretório, sem seguir a montagem EFS.
- [x] Remover ficheiros órfãos, experiências não integradas e artefactos locais.
- [x] Retirar dependências experimentais e tornar os grupos ativos opcionais explícitos.
- [x] Regenerar dependências e validar instalação, Python, tradução, portal e CI.

Lockfile de 221 para 148 entradas; a instalação mínima usa nove pacotes e passa
18 testes do ETL. Ambiente completo: 21 testes Python, cinco de tradução e 99 do
portal aprovados, um ignorado; auditoria dos 147 pacotes sem avisos conhecidos.

Preservar as ferramentas do ambiente/IDE, fontes, propostas, backups, modelos
locais e a entrega warehouse usada pelo portal. A montagem EFS sai do Git mas
permanece disponível na instância.

#### Fusão dos módulos auxiliares — 2026-10-15

- [x] Reunir caminhos e leitura de respostas em `http-client.ts`.
- [x] Reunir respostas e URLs públicas das APIs em `server-http.ts`.
- [x] Reunir input, textarea e estilo de select em `ui/form-controls.tsx`.
- [x] Validar imports, lint, tipos, testes, build e documentação.

Sete ficheiros passam a três, mantendo a separação cliente/servidor e os mesmos
exports públicos. Registar esta etapa num commit separado.

#### Consolidação dos testes — 2026-10-15

- [x] Reunir navegação e responsividade em browser/ui.mjs, mantendo todos os cenários.
- [x] Reunir configuração, URLs públicas e compatibilidade em infrastructure.test.mjs.
- [x] Partilhar arranque do browser, leitura de fixtures e mock de tradução.
- [x] Comparar verificações, executar testes e atualizar os comandos e documentação.

As asserções e condições de falha originais foram comparadas automaticamente.
99 testes unitários aprovados e um ignorado; build aprovado; 42 cenários de
interface, stress, dois cenários de briefing e apresentação do itinerário
aprovados numa instância de produção com armazenamento temporário.

#### Consola de desenvolvimento no SageMaker

- [x] Corrigir URLs da fonte e stack frames do overlay para respeitarem o prefixo.
- [x] Limitar a supressão de atributos de extensões à hidratação do body.
- [x] Validar check, build e navegador com prefixo e atributos Grammarly simulados.

100 testes aprovados e um ignorado; fonte e stack frames HTTP 200.

#### Identificação e rótulos dos formulários

- [x] Associar os rótulos do briefing e identificar os campos sem id/name.
- [x] Usar fieldset/legend nos grupos de escolhas e nome acessível na pesquisa.
- [x] Verificar campos, rótulos e IDs no teste de navegador do briefing.

Check aprovado (100 testes e um ignorado), build aprovado e briefing validado
em 360 e 1440 px, incluindo edição, revisão e payload.

#### Próxima iteração do agente

- [ ] Definir o objetivo, as operações autorizadas e os critérios de aceitação.
- [ ] Rever o serviço existente `src/blu_ai/` e os contratos de domínio do portal.
- [ ] Definir esquemas de ações e validar respostas antes de alterar itinerários.
- [ ] Evitar duplicação de catálogo, regras de curadoria e persistência.
- [ ] Definir fornecedor, custos, privacidade, timeouts e degradação com mocks.
- [ ] Manter confirmação humana, atividades protegidas e versões imutáveis.
- [ ] Validar credenciais e chamadas reais apenas no âmbito autorizado.

Ver [arquitetura e fronteiras](docs/ARCHITECTURE.md).

#### Base e qualidade

- [ ] Acrescentar CI do portal; o CI de dados e documentação não cobre o frontend.
- [ ] Automatizar catálogo aprovado → ETL → geração → confirmação → versão → PDF.
- [ ] Definir gates e exceções auditáveis para qualidade e conflitos das fontes.
- [ ] Rever os contratos de entrega, snapshot e retenção do warehouse no CI.

#### Entrega e recuperação

- [ ] Rever acesso, consentimento, retenção e revogação das partilhas e do Lixo.
- [ ] Inspecionar PDFs nos idiomas suportados e documentar fontes necessárias.
- [ ] Acrescentar fotografias apenas com autorização e créditos.
- [ ] Testar backup e recuperação de catálogo, histórico e PDFs.
- [ ] Atualizar a instalação do plugin Canva após revisão do pacote-fonte.
- [ ] Validar uma proposta real: TXT → cópia Canva → revisão → PDF final.

#### Operação multiutilizador e cloud

- [ ] Definir autenticação, papéis, permissões e sincronização.
- [ ] Definir minimização, retenção, eliminação e logs de dados pessoais.
- [ ] Validar concorrência de catálogo, rascunhos e versões.
- [ ] Definir deployment, segredos, região e recuperação operacional.
- [ ] Aprovar migração ou publicação antes de executar alterações externas.
- [ ] Escolher apenas os fornecedores necessários e definir contratos com mocks.
- [ ] Definir origem S3, retenção e fallback sem acoplar o ETL ao transporte.

#### Histórico

As integrações anteriores, os resultados e os limites estão em
[decisões](docs/DECISIONS.md), [testes](docs/TESTING.md) e
[segurança das dependências](docs/DEPENDABOT_PYTHON.md). O histórico completo dos
planos anteriores permanece no Git.

#### Observatório de dados BLU — 2026-10-16

- [x] Organizar o dashboard em Panorama, Explorar oferta, Preços, Histórico e Qualidade.
- [x] Aplicar identidade visual escura, tipografia editorial e gráficos legíveis.
- [x] Acrescentar pesquisa, filtros, fichas e distribuição geográfica do catálogo.
- [x] Comparar preços por categoria, unidade e natureza comercial declaradas.
- [x] Distinguir integridade, preenchimento e confirmação; expor lacunas e revisão.
- [x] Validar execução das cinco páginas e navegação local no navegador.
- [x] Harmonizar localizações e unidades através dos contratos do ETL.
- [x] Definir confirmação comercial e validade temporal por campo na fonte.

Dashboard só de leitura; sem alteração das fontes, catálogo operacional ou warehouse.
Mapa com contornos locais Natural Earth da Europa e norte de África, sem mosaicos externos; coordenadas válidas em intervalo não certificam a
localização. Experiências sem coordenadas continuam pesquisáveis na lista.

##### Ferramentas de exploração — 2026-10-16

- [x] Ligar seleção de pontos às fichas, preservando identificadores por tipo.
- [x] Comparar duas a quatro opções com duração, condições, acessibilidade e fonte.
- [x] Acrescentar painel por destino harmonizado, preservando as localizações originais.
- [x] Acrescentar camadas, nomes de lugares e agrupamento aproximado com membros.
- [x] Acrescentar fila de revisão com prioridades explícitas e acesso às fichas.
- [x] Mostrar presença histórica apenas através da relação explícita de atrações.
- [x] Acrescentar modo apresentação com navegação e saída acessíveis.
- [x] Alinhar mapas, tabelas e gráficos adjacentes em 420 px e uniformizar as divisórias da navegação.
- [x] Acrescentar fotografias quando existirem imagens com autorização e créditos (Lisboa e Porto, CC0).

Validação desta etapa: 51 testes Python aprovados, incluindo sete contratos do
dashboard. AppTest nas seis áreas, comparação, filtros e camadas vazias; navegador
local com cliques em pontos/grupos, comparação, destino Lisboa, apresentação e
vista móvel sem transbordo horizontal. Sem chamadas a IA ou alteração dos dados.

##### Conclusão do Observatório — 2026-10-16

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

#### Preenchimento verificado do warehouse — 2026-10-16

- [x] Inventariar lacunas e procurar valores em fontes oficiais.
- [x] Distinguir modalidades e tarifas públicas de valores comerciais BLU.
- [x] Preparar e validar o lote em cópia isolada antes de alterar o catálogo.
- [x] Preencher 45 valores em 13 registos e três preços numéricos por referência exata.
- [x] Criar novas revisões com evidência e preservar todas as revisões anteriores.
- [x] Publicar pelo ETL, sem alterar os Excel/PDF originais.
- [x] Registar fontes, dados não inferidos e limitações no relatório de enriquecimento.

Ver [dados acrescentados e fontes oficiais](docs/DATA_ENRICHMENT.md). A confirmação
de valores públicos não implica reserva, disponibilidade ou tarifa negociada.
Identificações ambíguas, descontos e preços sem fonte continuam pendentes.

Validação: bateria Python com 76 testes aprovados; 34 contratos revalidados
após os reforços de preservação de zeros e preços divergentes. Integração
catálogo/ETL e seis áreas em AppTest aprovadas. Navegador real confirmou
morada, tarifa, evidência e apresentação móvel. ETL publicado com zero erros;
13 revisões correntes correspondem à entrega e os snapshots anteriores foram
comparados sem alterações. Os Excel/PDF e as propostas históricas ficaram intactos.

#### Refinamento visual do portal — 2026-10-18

- [x] Confirmar `portal-observatorio` e preservar a lógica dos fluxos.
- [x] Reforçar a identidade, navegação, hierarquia e legibilidade dos formulários.
- [x] Validar check, build e cenários de navegador em seis idiomas.

Direção editorial clara, com navegação azul profunda e acentos dourados.
Sem alterações de dados, fornecedores ou publicação.

Validação: check aprovado (95 testes e um ignorado), build de produção aprovado
e 42 cenários de interface nos seis idiomas aprovados, com tradução e dados de
itinerário simulados. Inspeção visual em 390/1440 px sem transbordo; cabeçalho,
campos, etapas e ações revistos. Três traduções portuguesas afinadas após essa
bateria, com nova compilação e verificação de apresentação. Documentação e
`git diff --check` aprovados. Portal local na porta 3001, sem publicação.

#### Observatório nativo no catálogo — 2026-10-18

- [x] Criar contrato de leitura do warehouse reutilizando as regras ETL.
- [x] Implementar seis vistas interativas com o estilo claro do portal.
- [x] Preservar o editor e manter o dashboard original sem alterações.
- [x] Validar contratos, interface, catálogo/ETL, check e build.

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

#### Legibilidade do mapa e alinhamento dos painéis — 2026-10-18

- [x] Dimensionar pontos e áreas de clique em píxeis, independentemente do zoom.
- [x] Agrupar visualmente pontos próximos e melhorar etiquetas e informação de foco.
- [x] Uniformizar as alturas dos painéis adjacentes e compactar espaços verticais.
- [x] Validar interação, dimensões em navegador, check e build.

Validação: check aprovado (97 testes, um ignorado), build aprovado e cenários
do Observatório em 320/1440 px aprovados. As verificações medem alvos de 44 px
antes e depois do zoom, ausência de etiquetas sobre os marcadores e diferença
inferior a 2 px entre painéis adjacentes em ecrã largo. Inspeção visual em
390/1440 px: painéis de 631 px em desktop, alturas adaptáveis em móvel e
contagens de grupos com vários destinos sem atribuição ao primeiro destino.
Tradução e falha de recuperação simuladas; dados analíticos locais só de leitura.
Dashboard original, dados e configuração de arranque preservados.

#### Largura comum das páginas — 2026-10-18

- [x] Centralizar a largura exterior em 1440 px e as margens em 16/32 px.
- [x] Aplicar o contentor a Catálogo, Histórico, Referências, Lixo e partilhas.
- [x] Alinhar cabeçalho e workspace; retirar o limite independente do briefing.
- [x] Validar dimensões em ecrãs móveis, desktop e largos, check e build.

Manter a composição funcional do workspace e a coluna de leitura das partilhas.

Validação: `npm run check` com 97 testes aprovados e um ignorado; build aprovado.
Navegador: 48 cenários de interface/navegação em seis idiomas, com comparação
das páginas em 320/1440/1920 px e sem transbordo horizontal. Em 1920 px,
os cinco contentores medidos têm 1440 px e começam em x=240. Tradução e
geração de itinerários simuladas nos cenários aplicáveis. Inspeção visual do
catálogo e briefing em ecrã largo aprovada.

#### Contentores responsivos — 2026-10-18

- [x] Substituir o teto de 1440 px por largura fluida comum a todas as páginas.
- [x] Tornar as margens proporcionais ao ecrã, entre 16 e 64 px.
- [x] Verificar navegação entre 320 e 2560 px, check e build.

Validação: check aprovado (97 testes e um ignorado), build aprovado e 66
cenários de interface/navegação em seis idiomas. Largura fluida e alinhamento
verificados em 320/768/1024/1440/1920/2560 px, sem transbordo horizontal.
Observatório aprovado em 320/1440 px; tradução e geração simuladas nos
cenários aplicáveis. Dashboard original e dados preservados.

#### Limpeza local de artefactos — 2026-10-18

- [x] Inventariar os ficheiros ignorados e confirmar os serviços ativos.
- [x] Remover caches Next.js de desenvolvimento/compilação, cache TypeScript
  e bytecode Python do projeto; preservar build de produção e dependências.
- [x] Confirmar o portal e a integridade dos ficheiros versionados.

Removidos 426 MiB de artefactos regeneráveis. Portal e dashboard original
respondem HTTP 200 após a limpeza. Verificação da estrutura (340 ficheiros)
e `git diff --check` aprovados. Código, dados, exports e ambientes preservados.

#### Tema claro e escuro — 2026-10-18

- [x] Manter o tema claro original como padrão e centralizar a paleta do portal.
- [x] Adicionar seletor acessível no cabeçalho, com preferência no navegador.
- [x] Aplicar a preferência antes da primeira pintura e sincronizar separadores.
- [x] Validar contraste, persistência, navegação responsiva, check e build.

Validação: check aprovado (97 testes e um ignorado), build aprovado, lint e
formatação finais aprovados. Navegador: 66 cenários responsivos/navegação em
seis idiomas; tema em 320/768/1440/2560 px com persistência, sincronização,
teclado, impressão clara e armazenamento da preferência bloqueado. Contraste
de texto principal, formulário e seletor medido em pelo menos 4,5:1 no modo
escuro após as transições. Observatório aprovado em 320/1440 px. Inspeção
visual do briefing e catálogo em tema escuro aprovada. Tradução e geração
simuladas nos cenários aplicáveis; dashboard, dados e templates PDF intactos.

#### Revisão de testes e artefactos — 2026-10-18

- [x] Rever testes unitários, de integração e navegador face ao código atual.
- [x] Retirar 12 combinações visuais redundantes e asserções imediatas que
  repetiam a espera de elementos ocultos. Preservar os fluxos funcionais.
- [x] Validar a matriz reduzida, check e traduções com modelos instalados.
- [x] Limpar caches regeneráveis e capturas de testes antigas.

Removidos 529,9 MiB: downloads Argos já instalados, cache de compilação
Next.js e capturas Canva regeneráveis. Os seis pares de modelos instalados
foram confirmados pelos metadados. Corrigida também uma expressão sem efeito
no teste de tema que era assinalada pelo lint.

Validação: check aprovado (97 testes e um ignorado), 54 combinações de
interface/navegação aprovadas, temas em quatro larguras aprovados e cinco
testes do worker de tradução aprovados com modelos simulados. Estrutura de
344 ficheiros, Markdown e `git diff --check` aprovados. Portal e dashboard
respondem HTTP 200. Código funcional, dados, exports e modelos preservados.

#### Guião de apresentação interativa — 2026-10-18

- [x] Rever arquitetura, portal, dados e implementação do assistente.
- [x] Criar `docs/APRESENTACAO.md` com narrativa de 12 minutos, caso fictício,
  proposta navegável e esquemas Mermaid dos fluxos.
- [x] Distinguir capacidades implementadas, dependências e evolução proposta.
- [x] Verificar ligações, Markdown e integridade da documentação.

Validação: ligações locais do novo guião, Markdown, verificação da estrutura
e `git diff --check` aprovados. Alteração apenas documental; sem execução de
serviços externos, alteração de dados ou implementação da apresentação.

#### Dashboard de apresentação independente — 2026-10-18

- [x] Criar uma aplicação estática em `presentation/dist`, com três cenas
  fictícias, mapa esquemático e adaptação do roteiro em memória.
- [x] Servir na porta 3003 com Python padrão, sem dependências do portal.
- [x] Retirar os ficheiros parciais do protótipo Next.js antes de os integrar.
- [x] Validar interação, teclado, responsividade e isolamento dos serviços.

Validação: percurso completo em 320/768/1440/2560 px aprovado, incluindo
escolha refletida no roteiro, pontos do mapa com alvos de 48 px, alteração
reversível, navegação por teclado e fallback de ecrã inteiro. Sem chamadas
externas/API, sem escrita no localStorage e sem erros JavaScript. Caminhos
diretos e com prefixo Studio, com/sem barra final, aprovados localmente.
Inspeção visual das três cenas e do mapa móvel concluída. JS/Python, Markdown,
estrutura e `git diff --check` aprovados. Portal e Streamlit mantêm os mesmos
processos e HTTP 200; não houve build, restart ou alterações aos seus ficheiros.
O acesso autenticado pelo proxy AWS real não foi validado pelo navegador local.

#### Continuação da apresentação — 2026-10-18

- [x] Alargar o percurso de três para oito capítulos com dados, colaboração,
  entrega, arquitetura e encerramento.
- [x] Ligar as escolhas ao roteiro, à pré-visualização e ao resumo final.
- [x] Configurar o CTA final com o domínio do Observatório enviado pelo utilizador.
- [x] Validar o percurso completo, responsividade e isolamento do portal AWS.

Validação: oito capítulos aprovados em 320/768/1440/2560 px, incluindo
fluxo de dados, pedido bloqueado sem alteração, ajuste permitido, comparação
de exemplos de versões, arquitetura e resumo final. O CTA final corresponde
exatamente ao URL indicado e abre um novo separador com `noopener`. Sem
visitar o destino real, chamadas a APIs, escrita no navegador ou erros JS.
Inspeção visual das novas cenas concluída. Sintaxe JS, documentação, Markdown
e `git diff --check` aprovados; serviços e ficheiros do portal intactos.

#### Guião técnico em três partes — 2026-10-18

- [x] Reorganizar `docs/APRESENTACAO.md` em fundamentos técnicos, experiência
  interativa e demonstração do portal real.
- [x] Detalhar requisitos, arquitetura, tecnologias, dados/processos, IA e
  validação, com referências de código e cinco cenas técnicas propostas.
- [x] Distinguir o guião proposto da interface já implementada e evitar
  repetição dos capítulos técnicos na transição.
- [x] Validar Markdown, ligações e integridade documental.

Na revisão documental inicial, a implementação visual ficou pendente;
ver a conclusão do ato técnico abaixo.

Revisão concluída em 2026-10-19: ligações locais, Markdown, estrutura do
projeto e `git diff --check` aprovados. Quatro esquemas Mermaid incluídos.
Alteração apenas documental; a abertura técnica ainda está proposta no guião.

#### Ato técnico com animações explicativas — 2026-10-19

- [x] Preparar cinco cenas técnicas com requisitos, arquitetura/tecnologias,
  percurso dos dados, mecanismos de IA e contratos de validação.
- [x] Integrar a navegação em três partes e animações controláveis.
- [x] Validar interações, movimento reduzido, responsividade e isolamento.

Validação em 2026-10-19: cinco cenas técnicas e oito narrativas aprovadas em
320/768/1440/2560 px, com teclado, navegação entre partes, falha ilustrativa
de publicação e preservação das escolhas. Ligações animadas, pausa manual e
movimento reduzido verificados; movimento efetivo do registo entre etapas
confirmado no navegador. Sem chamadas a APIs/fornecedores, escrita em
localStorage ou erros JS. Inspeção visual da abertura técnica concluída.
JS, Markdown, estrutura e `git diff --check` aprovados. Apenas a apresentação
independente foi iniciada; código e dados do portal/Streamlit intactos.

#### Base pública dos dashboards — 2026-10-19

- [x] Guardar o endereço Studio fornecido em `config/studio.json`.
- [x] Gerar os três URLs com `scripts/studio_urls.py`; usar a origem no
  arranque AWS por defeito, preservando override explícito.
- [x] Anunciar o endereço público correto no servidor da apresentação.
- [x] Verificar ligações, comandos e serviços após aplicar a configuração.

Validação: seis testes de infraestrutura/origens aprovados, sintaxe dos dois
arranques shell aprovada e URLs gerados iguais à base indicada. Os três
serviços foram reiniciados com a configuração correta e respondem HTTP 200
localmente. Markdown, estrutura e `git diff --check` aprovados. Sem build,
alteração de dados ou renovação automática da sessão AWS.

#### Auditoria editorial e detalhe técnico — 2026-10-19

- [x] Identificar repetição de dados, arquitetura, limites e mensagens de revisão.
- [x] Remover cenas e explicações duplicadas da parte narrativa.
- [x] Acrescentar detalhe de implementação, dependências, integrações e automação.
- [x] Registar lacunas que exigem informação futura da equipa, sem as inventar.
- [x] Validar o percurso revisto, acessibilidade, animações e documentação.

Validação: seis cenas técnicas e seis narrativas aprovadas em
320/768/1440/2560 px, incluindo as sete áreas de tecnologias e os seus
aprofundamentos. Navegação, teclado, escolhas, movimento reduzido, pausa e
movimento efetivo do registo verificados no navegador. Sem chamadas externas,
escrita em localStorage ou erros JS. Inspeção visual das tecnologias, entrega
e fecho concluída. Sintaxe JS, Markdown, estrutura e `git diff --check`
aprovados. Portal, dashboard original e dados sem alterações. Valores dos
manifests e predefinições de código não são apresentados como medições ou
configuração efetiva dos serviços.

#### Grelha dos seis capítulos — 2026-10-19

- [x] Corrigir a grelha narrativa que ainda reservava oito colunas.
- [x] Distribuir seis capítulos por seis, três ou duas colunas conforme o ecrã.
- [x] Validar no navegador a grelha, contagem e percurso nas quatro larguras.

Grelha, seis botões e contador `/ 06` verificados em 320/768/1440/2560 px,
na técnica e na curadoria. Estrutura e `git diff --check` aprovados.

#### Limpeza local do diretório — 2026-10-19

- [x] Inspecionar ficheiros, referências e serviços em execução.
- [x] Limpar caches de instalação dispensáveis e bytecode local.
- [x] Confirmar serviços, estrutura e preservação dos ficheiros do projeto.

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

#### Eficiência TXT/Canva — 2026-10-19

- [x] Alterar o botão e traduções para Exportar TXT.
- [x] Reduzir repetição no prompt e impedir carregamento da curadoria na composição.
- [x] Remover aceitação do plano; preservar aprovação obrigatória das ferramentas.
- [x] Testar dataset e edição de um dia numa cópia reduzida do modelo Canva.
- [x] Executar verificações locais e preparar pacote 0.4.0, com limites abaixo.

Teste parcial: modelo sem autofill; caixas do dia editáveis, nota ultrapassa
painel original. Não equivale à validação de uma proposta completa. Instalação
remota 0.2.0 permanece independente da fonte local; atualização por publicar.

Verificação concluída: cinco testes TXT aprovados; lint, TypeScript e Prettier
aprovados. Suite geral: 97/98, falha em road-routing (isAlgorithmOptimized).
Estrutura e diff --check aprovados. Build bloqueado por acesso negado do SWC
na canonicalização Windows do diretório. Pacote 0.4.0 preparado, não publicado.
Prompt: 9824 → 3889 caracteres (-60,4%); JSON do caso de seis dias/23 entradas
idêntico. Sem medição de tokens faturados ou tempo de geração ponta a ponta.

#### Plano histórico deste branch — 2026-10-21

O conteúdo seguinte é preservado como registo do plano original. Não reabre
tarefas já realizadas nem comprova o estado atual; o plano de dev acima e
o código são as referências operacionais desta integração.

##### Active plan

###### Objective

Evolve the validated local BLU system toward the supplied architecture diagram
while preserving source lineage, deterministic curation, human approval, privacy,
and immutable itinerary history.

The diagram is directional evidence, not an approved provider contract. Its
original separate Google Forms intake is superseded by the product decision to
embed intake directly in the curator dashboard. The remaining target elements
are S3, a Bedrock agent, company data and prompts, external APIs, route/change
requests, and save behavior. The repository currently implements a local ETL,
warehouse, analytical Streamlit dashboard, and a richer Next.js operational
workspace.

###### Current baseline

- [x] Local source discovery, lineage, structured enrichment, and validated
  atomic warehouse publication.
- [x] Streamlit analytics over warehouse and report artifacts.
- [x] Next.js traveler brief, deterministic catalogue curation, human editing,
  immutable version history, and PDF export.
- [x] Optional offline portal/PDF translation.
- [x] Version 1.0 embedded intake in
  `dmc-workspace/src/components/NewTripScreen.tsx`; Google Forms is out of scope.
- [ ] Integrate the agent-guidance commit `cb60263` into the chosen integration
  branch.
- [ ] Review and integrate translation setup fix `0c1ba50`.
- [ ] Reconcile the obsolete root README with the implemented product.
- [ ] Decide whether `origin/dev` becomes `main` or the repository default
  branch changes.

###### Phase 0 - Decisions and contracts

- [ ] Document the accepted operational boundary: Next.js owns embedded intake
  and curation; Streamlit remains analytical.
- [ ] Define and approve `TravelerBrief`, `Itinerary`, `ProviderEvidence`,
  and `CompanyKnowledge` contracts.
- [ ] Decide the Bedrock/OpenAI responsibility boundary and require a
  provider-neutral application interface.
- [ ] Define what S3 would store, including identifiers, encryption, retention,
  deletion, regional constraints, and local fallback.
- [ ] Approve privacy, consent, prompt-redaction, audit, and release roles.
- [ ] Choose one acceptance scenario and measurable cost, latency, reliability,
  and accessibility constraints.

Completion: decisions are recorded in `memory/decisions.md` or ADRs and the
acceptance scenario can be tested without selecting a live provider.

###### Phase 1 - Harden the local baseline

- [ ] Decide whether `warehouse/` is a committed release snapshot, CI artifact,
  or both.
- [ ] Make PDF extraction failures a publication gate or define an explicit,
  auditable waiver.
- [ ] Define approved structured conflicts by identity and test them, rather than
  asserting only the current count.
- [ ] Add dashboard unit coverage and one Streamlit smoke test.
- [ ] Add frontend CI for tests, TypeScript, lint, and build.
- [ ] Add schema/manifest compatibility checks for Streamlit and Next.js
  consumers.
- [ ] Add one end-to-end local acceptance test: normalized brief -> curated
  itinerary -> curator approval -> immutable version -> reproducible PDF.
- [ ] Remove tracked cache/platform artifacts in a dedicated reviewed change.

Completion: both applications consume a validated compatible delivery, branch-only
fixes are reconciled, and the local acceptance path is automated.

###### Phase 2 - Provider-neutral integration layer

- [ ] Add typed interfaces for intake, routing, weather, POIs, object storage,
  and model orchestration.
- [ ] Implement deterministic mock adapters and failure-mode tests first.
- [ ] Define timeouts, bounded retries, cache/freshness rules, attribution,
  sanitized errors, telemetry, and cost controls.
- [ ] Keep provider evidence, BLU facts, and generated text distinguishable.
- [ ] Ensure provider failure degrades explicitly without inventing availability,
  price, weather, travel time, or accessibility.

Completion: the chosen acceptance scenario runs entirely with mocks and records
provider, retrieval time, request context, status, and evidence.

###### Phase 3 - First live provider

- [ ] Re-verify current availability, licensing, pricing, coverage, and data terms
  for the diagram's routing candidates.
- [ ] Select one routing provider; do not add multi-provider failover yet.
- [ ] Enrich itinerary transit legs without silently overriding curated facts.
- [ ] Add mocked contract tests and one explicitly approved live smoke test.

Completion: one route result is traceable, replaceable, failure-tolerant, and
visible to the curator before approval.

###### Phase 4 - Embedded intake and object storage

- [ ] Evolve the version 1.0 dashboard form against the approved
  `TravelerBrief` contract without creating a separate intake channel.
- [ ] Preserve validation errors and draft state inside the curator workflow.
- [ ] Validate, minimize, and redact data before persistence or model calls.
- [ ] Add an S3 adapter with least privilege, encryption, lifecycle policy, and
  idempotent writes.
- [ ] Preserve local adapters for development and offline tests.

Completion: one consented dashboard intake can be validated, curated, replayed
locally, and persisted through the approved cloud boundary without changing
domain logic.

###### Phase 5 - Agent orchestration

- [ ] Place Bedrock or the approved model behind the provider-neutral interface.
- [ ] Version prompts and company knowledge independently from generated text.
- [ ] Restrict model output to validated structured proposals and supported
  commands.
- [ ] Test prompt injection, malformed output, sensitive-data handling, timeout,
  retry, and model/provider failure.
- [ ] Require curator approval before saving or exporting a released itinerary.

Completion: model output cannot bypass deterministic constraints, evidence
boundaries, version history, or the human release gate.

###### Phase 6 - Weather and POI enrichment

- [ ] Re-verify and select providers only for an approved acceptance scenario.
- [ ] Define freshness, attribution, conflict, and degradation policies.
- [ ] Add latency, cache, quota, and cost observability.
- [ ] Keep live enrichment advisory until the curator accepts it.

Completion: weather and POI data are traceable enhancements, never silent
replacements for warehouse facts.

###### Phase 7 - Deployment and operations

- [ ] Define environments, infrastructure as code, secrets, logging, alerting,
  backups, recovery, retention, and incident response.
- [ ] Add integration-contract, security, privacy, performance, and cost gates.
- [ ] Approve deployment and migration plans before any AWS write.

Completion: production readiness is evidenced by tested operational controls, not
only a successful deployment.

###### Deferred

- Ride-hailing, public transit, events, tourism trends, flight status, and visa
  providers listed in the diagram.
- Multi-provider failover before one provider contract is proven.
- Automated itinerary release without curator approval.

###### Validation policy

Use the closest `AGENTS.md` for commands. Every phase must include focused tests,
`git diff --check`, and an explicit review of skipped checks, costs, side effects,
privacy impact, and generated artifacts.
