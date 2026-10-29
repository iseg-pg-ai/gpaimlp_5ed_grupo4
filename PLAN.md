# Plano de evolução do BLU AI System

## Pendências ISEG — 2026-10-28

Levantamento da folha de requisitos ISEG contra o código. A folha pede sobretudo
dados (perfil, atrações, restaurantes, experiências, 51 regras, preços e três
tiers), já cobertos pelo catálogo e pelo ETL. Ficam os pontos pedidos pelo Zolton,
um de cada vez:

- [x] Seguimento que corre sozinho com alertas à equipa: a verificação de 5
  minutos (`ScheduledNotifications`) cria alertas para leads fora do prazo ou em
  risco, escala aos fundadores após 4 h, avisa tarefas atrasadas ou bloqueadas,
  casos fora do prazo e lembretes falhados; cada alerta só sai uma vez, por email
  (SES, se configurado) e em «O meu trabalho». Leads sem responsável aparecem a
  curadores e fundadores. Testes locais com mocks; sem deploy.
- [x] Painel da fundadora («Visão geral», só fundadores, `GET /v1/control`):
  seguimentos dentro e fora do prazo, em risco e sem responsável; pontos de falha
  (contas desativadas com trabalho, tarefas sem responsável, alertas sem
  destinatário ou com email falhado, seguimento dependente de uma pessoa, carga
  desigual); quem tem o quê; lembretes e alertas dos últimos 7 dias. Testes locais
  (100/100, incluindo synth) e pré-visualização no navegador a 375 px e desktop.
- [x] Análise automática das conversas (`signals.mjs`): o modelo da intranet indica
  sentimento e sinais (interesse, falta de informação, proposta, risco, fora do âmbito)
  com confiança e prova nas mensagens do cliente; abaixo de 0,7 fica «incerto» e não
  conta. Ninguém altera os sinais à mão (etiquetas manuais ignoradas pela API e fora
  do ecrã; as antigas ficam guardadas, sem uso). Risco confiante gera o alerta à
  equipa. Testes com modelo simulado; sem chamadas reais ao Bedrock.
- [x] Feedback inferido: a análise corre quando a conversa pára 2 minutos (10 depois da
  primeira leitura) e também
  avalia o chatbot (boa, a melhorar, errada) com prova nas mensagens; aparece em
  Operações → Conversas para rever, ao lado do feedback da fundadora.
- [ ] Avaliações online (Google, TripAdvisor…) na secção de feedback: falta saber as
  plataformas e o acesso (API ou exportação).
- [ ] Propostas com melhor retorno para autoavaliação do curador: falta definir o
  retorno (aceites, valor, margem) e onde está esse dado.
- [ ] Portal: retirar as caixas de etiquetas da página de Leads e mostrar a análise
  automática (precisa de `npm ci` em `dmc-workspace/` e espaço em disco).
- [x] Números e linhas do Painel e da Visão geral são atalhos para Seguimento (no lead
  certo), Agenda, WhatsApp, Casos e «O meu trabalho».
- [ ] Alertas do Monitoring para os responsáveis (ver «Pendências de monitoring»).
- [ ] Número WhatsApp partilhado da equipa (VoIP verificado pela Meta) com
  distribuição interna; até lá, o número do site (+351 915 784 212) como substituto.
- [ ] Depois do login, todos entram no painel da intranet; opções por papel e
  geração de proposta para Canva no perfil de marketing/curador.
- [x] Avaliação dos parceiros: resultado de cada serviço na Agenda e pontuação,
  posição por tipo, pontualidade, clientes, fiabilidade, margem, ROI e preço por
  pessoa no separador Parceiros; ordem pela pontuação ao agendar (por publicar).
- [ ] Parceiros no portal: sugerir o parceiro mais bem avaliado em cada atividade
  da proposta (ligação ao catálogo) e confirmações por WhatsApp como indicador.
- [ ] Testes do percurso do lead, de fornecedores válidos e de parceiros com licença.
- [x] Assistente da intranet (separador «Assistente», todos os perfis): responde a
  partir do que o perfil já vê (trabalho, alertas, totais, leads, visão geral,
  regras) e de um guia; sugere botões (abrir, preparar tarefa, rascunho de
  resposta) que a pessoa clica; sem contactos de clientes. Testes com modelo
  simulado; sem chamadas reais ao Bedrock.
- [x] Canva: «Canva: dias (CSV)» no portal, para a criação em massa no modelo BLU
  (uma página por dia). Teste unitário passou; `tsc`, lint e `next build` por
  correr (sem `node_modules`, disco cheio).
- [x] Portal: guarda que volta a ligar o servidor quando a limpeza da conta o
  desliga e página «o portal está a acordar» em vez do 504 (por publicar).
- [ ] Ambiente local: sem `node_modules` no portal nem `.venv`; `npm run check/build`
  e testes Python ainda por correr (o synth CDK já corre em `infra/`).

## Portal e intranet com endereços próprios — 2026-10-26

Cada parte tem a sua distribuição CloudFront: site público, intranet e portal
DMC (stack `BluCostaPortal`). Detalhes em [Portal](docs/PORTAL.md#servidor-privado-com-cloudfront-piloto).

- [x] Backoffice em `d1x28h8mbkgn1v.cloudfront.net`, publicado e verificado (2026-10-26).
- [x] Backoffice retirado do código (2026-10-29): era a intranet com quatro
  separadores escondidos num segundo endereço. A intranet é o único site da
  equipa; o endereço do backoffice desaparece no próximo deploy de
  `BluCostaIntranet` (bucket retido). Ver [Decisões](docs/DECISIONS.md).
- [x] Stack `BluCostaPortal`: servidor privado, portão de login, build no CodeBuild e cópia diária.
- [ ] Publicar `BluCostaPortal` e validar o login, o catálogo e uma exportação PDF na AWS.
- [ ] Publicar o estado do portal na release operacional S3 (`BLU_DATA_S3_BUCKET`);
  hoje o disco do servidor é o estado e as cópias EBS são o backup.
- [ ] Meteorologia, planeador do assistente e tradução sem internet no servidor.
- [ ] Fonte CJK no build para PDFs em mandarim.

### Perfil de curador: propostas com mapa e Canva da equipa — 2026-10-27

Pedido da equipa: no perfil de curador, a proposta e as suas ferramentas ficam à
mão, sem procurar noutros sites. Hoje o portal tem o mapa do catálogo no
Observatório (SVG, sem rotas) e a exportação «TXT para Canva» de uma versão
guardada; não há mapa da proposta nem ligação à equipa no Canva.

- [x] Mapa da proposta no portal: os pontos de cada dia e a ordem do percurso,
  a partir das coordenadas do catálogo já usadas no encaminhamento; pontos sem
  coordenadas listados à parte (desconhecido não é «perto»). Testes unitários,
  tipos e lint passaram; o `next build` local não correu por falta de memória.
- [x] Intranet, perfil de curador: um só atalho, «Proposta no portal», no lead
  (ligação direta de um nível); o mapa fica dentro da proposta.
- [ ] Publicar `BluCostaIntranet` e `BluCostaPortal` e validar o mapa com uma
  proposta real depois do login.
- [ ] Canva da equipa como opção do curador: pasta da equipa BLU (endereço a
  indicar pela equipa); a integração por API do Canva fica para depois de aprovar
  custos e acesso. O CSV de criação em massa já cobre a geração por dia.
- [ ] Separação por perfil dentro do portal: marketing sem dados de clientes.

## Intranet BLU — 2026-10-25

Especificação em [intranet BLU](docs/INTRANET.md): stack `BluCostaIntranet`
com login Cognito (MFA), seguimento de leads com a conversa do chatbot,
painel, equipa, operações e governança com mapeamento ISO proposto (sem
afirmar certificação). A API de leads abaixo foi absorvida por esta stack.

- [x] Publicar `BluCostaBackoffice` (2026-10-25, papel de análise só para o SSO de administração).
- [x] Integrar `origin/dev` em `inge/addon`.
- [x] F0: stack, login com MFA e página estática em `frontend/intranet/`.
- [x] F1: seguimento (leads, conversa, responsável, etiquetas, pergunta ao RAG).
- [x] F2: painel sem dados sintéticos; equipa e operações.
- [x] F3: governança só de leitura; manifesto em `config/governance-controls.json`.
- [ ] Deploy de `BluCostaBackoffice` e `BluCostaIntranet` após `cdk diff` aprovado.
- [ ] Criar as contas da equipa e validar o login com MFA na AWS.
- [ ] F4–F5: wiki (leitura, rascunhos e aprovação).
- [ ] Registar a decisão em `docs/DECISIONS.md`.

## API de leads com autenticação própria — proposta de 2026-10-25

Estado: **para revisão do grupo; nada implementado nem publicado.**
Contrato, segurança, testes e publicação em
[especificação da API de leads](docs/LEADS_API.md).

Problema: a página de Leads (`dmc-workspace/src/lib/leads.ts`) lê o DynamoDB
com as credenciais do ambiente. No Studio, isso é o papel partilhado
`SageMakerTeachingExecutionRole`, usado por todos os perfis do domínio
`trabalhos-finais`. Conceder-lhe acesso expõe os contactos BLU a outras equipas
(o domínio não transmite a identidade do utilizador ao papel) e falhou de
qualquer forma: as políticas inline do papel ocupam 9 980 de 10 240 bytes.
O papel partilhado não foi alterado.

Decisão proposta: o acesso pertence à pessoa autenticada, não à máquina. O
portal chama uma API BLU com login próprio e funciona igual no Studio, num
portátil ou alojado, sem tocar no papel nem no domínio do curso.

```text
Portal (servidor Next.js) ──login──▶ Cognito (só curadores BLU)
        │ token JWT
        ▼
HTTP API + autorizador JWT ──▶ Lambda leads-api ──política mínima──▶ DynamoDB
```

### Módulo novo: stack `BluCostaLeadsApi`

- Stack própria em `infra/aws-split-app.mjs`, ao lado de Data, Frontend e
  Backoffice; publica-se e remove-se sem afetar as outras. Reutiliza as
  tabelas existentes, sem nova persistência.
- Cognito: user pool sem registo público, contas criadas pelo grupo, grupo
  `curators`, MFA TOTP, tokens de 1 h. Login gerido pelo Cognito (código +
  PKCE) com URLs de retorno configuráveis (localhost, Studio, alojado).
- HTTP API com autorizador JWT e limitação de pedidos; sem CORS, porque só o
  servidor do portal a chama.
- Rotas: `GET /v1/leads?status=open|contacted`, `GET /v1/leads/{id}`,
  `POST /v1/leads/{id}/contacted`, `PUT /v1/leads/{id}/tags`.
- Lambda Node 22 com a política já validada no Access Analyzer: só `Query`
  nas duas tabelas e em `FollowUpIndex`; `UpdateItem` apenas nos campos de
  seguimento (estado, contacto, etiquetas, nota); sem `Scan` nem `DeleteItem`.
- Logs sem texto de mensagens nem contactos; registam utilizador, rota e id.
- Saídas: URL da API, user pool, client id e domínio de login para o `.env`.

### Portal: alteração pequena

- `leads.ts` mantém as mesmas funções e erros exportados (`listLeads`,
  `getLead`, `markContacted`, `tagLead`), passando a chamar a API com o token
  da sessão. Páginas e componentes não mudam.
- Uma única fonte de mapeamento: a Lambda devolve itens DynamoDB e o
  `leads-model.ts` existente continua a fazer `toLead`/`contactDetails`, sem
  empacotador novo em `infra/`.
- Sessão em cookie `httpOnly`, `secure` e `sameSite`; configuração por
  `BLU_LEADS_API_URL` e variáveis do Cognito. Sem acesso direto ao DynamoDB.

### Tarefas

- [ ] Rever e aprovar esta proposta em grupo.
- [ ] Stack `BluCostaLeadsApi` com Cognito, HTTP API, Lambda e política mínima.
- [ ] Lambda com testes unitários e DynamoDB simulado (sucesso, 404, campos
  recusados, paginação).
- [ ] Teste de synth: a política não contém `Scan`, `DeleteItem` nem curingas.
- [ ] Login/logout no portal e `leads.ts` como cliente da API, com testes de
  fetch simulado (sem sessão, token expirado, API indisponível).
- [ ] Cenário de navegador da página de Leads com API simulada.
- [ ] Atualizar runbook, `docs/ARCHITECTURE.md` e registar a decisão em
  `docs/DECISIONS.md` após aprovação.
- [ ] Com autorização: deploy, criação das contas de curador pelo grupo e
  verificação real (sem login 401, curador 200, campo não permitido recusado).

### Fora de âmbito e riscos

- Deploy, criação de contas e chamadas AWS exigem autorização na conversa.
  O disco local está praticamente cheio; `cdk synth` não cabe sem libertar
  espaço.
- O URL do Studio muda por espaço; cada endereço tem de constar nas URLs de
  retorno do Cognito.
- Resolvido em `af957b7`: `BackofficeAnalysisRole` deixou de confiar em toda
  a conta e só confia nos ARNs de `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS`.
- Custo esperado baixo (Cognito no escalão gratuito, HTTP API por pedido);
  confirmar no orçamento antes do deploy.

## Consolidação documental — 2026-10-24

- [x] Comparar os guias ativos com o código, manifests, scripts e workflows.
- [x] Remover dos documentos operacionais os blocos históricos repetidos.
- [x] Alinhar onboarding, portal, ETL e catálogo com S3 autoritativo e cache em `/tmp`.
- [x] Corrigir o estado dos backups S3 e das pendências de produção.
- [x] Atualizar a memória de arquitetura e validar Markdown, ligações e diferenças.
- [x] Fundir persistência/recuperação nos guias de Dados e Operações e reduzir
  resumos paralelos a redirecionamentos de compatibilidade.
- [x] Rever instruções locais, onboarding, defaults AWS e fronteira atual do agente
  contra o código e os manifests.
- [x] Remover índices de compatibilidade, memória paralela e o guia hipotético de
  deployment depois de integrar o conteúdo útil nas fontes principais.

## Logística de chegada e partida — 2026-10-23

- [x] Acrescentar horas e números de voo de chegada e partida ao briefing.
- [x] Preservar compatibilidade com versões antigas sem estes campos.
- [x] Incluir a logística no resumo, histórico e PDF do itinerário.
- [x] Validar formulário responsivo, persistência, testes e build do portal.

## Edição de itinerários pelo Blu — 2026-10-23

- [x] Separar a origem de uma alteração do bloqueio explícito da atividade.
- [x] Permitir alterações consecutivas pelo Blu no mesmo dia e em dias diferentes.
- [x] Preservar alterações manuais durante regenerações amplas do dia.
- [x] Manter ações explícitas do Blu disponíveis quando não existe proteção ou
  confirmação concluída.
- [x] Validar flags e origem nos snapshots para rejeitar estados antigos malformados.
- [x] Validar regressões, persistência, concorrência, histórico e build do portal.

## CI do warehouse sem fontes privadas — 2026-10-23

- [x] Remover do workflow a suposição de que as fontes ETL estão no Git.
- [x] Gerar uma fonte sintética temporária e executar o pipeline completo no CI.
- [x] Distinguir o artefacto de smoke test de uma entrega operacional BLU.
- [x] Validar localmente ETL, gate de qualidade e regressões equivalentes.

## Ligação pública da apresentação — 2026-10-23

- [x] Injetar na apresentação o URL absoluto do portal definido pela configuração
  do SageMaker Studio.
- [x] Validar o CTA final nos quatro tamanhos de ecrã usados pelo `just blu it`.
- [x] Reexecutar em conjunto os testes finais do protocolo de recuperação.

## S3 como fonte autoritativa de dados — 2026-10-22

Objetivo confirmado: o bucket de dados contém fontes, warehouse e todo o estado
operacional do portal. O disco da instância conserva apenas uma cache temporária,
reconstruível e exterior ao repositório. O bucket de backups mantém checkpoints
imutáveis para o protocolo de recuperação.

Estado: implementação operacional concluída. Permanecem as confirmações
administrativas, a política lifecycle e o ensaio integral indicados abaixo.

- [x] Definir releases operacionais completas com manifesto, hashes e apontador ativo.
- [x] Incluir catálogo, histórico, propostas PDF e operações pendentes na release.
- [x] Materializar atomicamente uma release S3 numa cache temporária validada.
- [x] Representar eliminações pela ausência na release ativa, preservando revisões.
- [x] Migrar e validar o estado local atual no bucket antes da mudança de caminhos.
- [x] Cobrir catálogo, versões, Lixo, restauros, partilhas, PDFs e ações do agente
  com publicação confirmada ou operação remota pendente.
- [x] Executar portal, ETL e Observatório exclusivamente sobre a cache temporária.
- [x] Fazer `just blu it` reconstruir o estado ativo a partir do bucket de dados
  quando não existir um checkpoint recuperável.
- [x] Fazer `just blu it` restaurar um checkpoint do bucket de backups e publicar
  explicitamente o estado recuperado como nova release ativa.
- [x] Validar indisponibilidade S3, concorrência, repetição e recuperação dos
  componentes; falta apenas executar o launcher integral com login interativo.
- [x] Depois da validação e de autorização destrutiva, remover os dados persistentes
  locais do diretório do projeto.

## Persistência operacional independente do ETL — 2026-10-22

Estado: concluída e validada, incluindo indisponibilidade prolongada do SQLite,
reinício, sincronização ordenada e repetição idempotente.

- [x] Mapear o warehouse e as duas bases SQLite operacionais.
- [x] Manter catálogo, histórico e fila fora do ciclo de publicação do ETL.
- [x] Proteger versões e revisões novas em JSON quando o SQLite está indisponível.
- [x] Sincronizar por chave idempotente e apagar apenas após confirmação SQL.
- [x] Incluir a fila persistente no backup e no restauro locais.
- [x] Executar um ensaio prolongado com SQLite indisponível, reinício do processo,
  várias operações dependentes e sincronização posterior.
- [x] Substituir a persistência local por cache temporária reconstruída a partir
  da release operacional ativa no S3.

## Cópias S3 e observabilidade da persistência — 2026-10-22

- [x] Manter checkpoint local e publicar uma cópia S3 quando configurada.
- [x] Validar upload/download por SHA-256 e recuperar remotamente sem cópia local.
- [x] Organizar objetos por ambiente, tipo e data, sem substituição ou eliminação.
- [x] Expor SQL, filas pendentes, último sync e estado S3 no Monitoring.
- [x] Validar restauro remoto, falha de rede e sincronização idempotente com mocks.
- [x] Validar IAM, AES-256, versionamento, upload e restauro num bucket real.
- [x] Definir uma proposta de lifecycle sem expiração de backups válidos.
- [x] **Exceção administrativa aceite:** a limpeza de uploads multipart incompletos
  após sete dias não pode ser aplicada pela role da aplicação. Nova verificação em
  2026-10-23 confirmou `AccessDenied`; a regra fica preparada para um administrador.
- [x] **Exceção administrativa aceite:** versionamento, Block Public Access,
  encriptação por defeito e lifecycle dos dois buckets não podem ser consultados
  pela role da aplicação. Nova verificação real em 2026-10-23 confirmou
  `AccessDenied` nos oito controlos; a confirmação visual fica fora deste âmbito.

## Transporte S3 de dados ETL — 2026-10-22

Estado: separação entre estado operacional, ETL e transporte S3 concluída. A
política futura de expiração continua bloqueada até as releases substituídas
serem identificadas explicitamente.

- [x] Separar o bucket de dados do bucket de checkpoints operacionais.
- [x] Publicar releases imutáveis de fontes e warehouse com manifesto final.
- [x] Excluir o catálogo SQLite operacional das fontes S3.
- [x] Bloquear warehouse sem validação aprovada.
- [x] Validar tamanho e SHA-256 após upload e download.
- [x] Recuperar apenas para diretórios novos ou vazios, sem substituir dados ativos.
- [x] Validar releases reais de fontes e warehouse no bucket autorizado.
- [ ] **Condicionada a uma política de expiração futura:** marcar releases
  substituídas antes de aprovar expiração de fontes ou warehouse. Até lá, nenhuma
  release válida é expirada.

## Recuperação identificada e alterações contínuas S3

- [x] Associar cada `just blu it` a um checkpoint com identificador único.
- [x] Parar todos os serviços depois do checkpoint e reerguê-los de forma controlada.
- [x] Recuperar primeiro o checkpoint da execução e usar o bucket de dados como fallback.
- [x] Reconstruir fontes e warehouse na cache temporária durante o fallback.
- [x] Criar uma outbox para cada alteração SQL confirmada do portal.
- [x] Enviar alterações periodicamente e remover JSON apenas após confirmação S3.
- [x] **Validação operacional encerrada com autenticação interativa:** o ciclo real
  de 2026-10-23 confirmou backup S3, paragem, recuperação e reinício até à tarefa
  11. O único teste que interrompeu o protocolo foi corrigido e passou isoladamente
  nos quatro tamanhos de ecrã; repetir a paragem integral fica como operação manual,
  não como desenvolvimento pendente.

O SQLite existe apenas como cache efémera de acesso enquanto o portal permanecer
numa única instância; a release S3 ativa é a fonte permanente. A fila JSON é
transitória, entra nas releases e checkpoints e não constitui outra fonte de
verdade.

## Recuperação com checkpoint e sincronização — 2026-10-22

- [x] Restaurar no `just blu it` um checkpoint externo válido identificado.
- [x] Recuar para uma versão anterior quando a mais recente estiver corrompida.
- [x] Inicializar estado novo e sincronizar JSON antes de iniciar serviços.
- [x] Versionar metadados por recurso e permitir restauro manual identificado.
- [x] Excluir credenciais, sessões e tokens das cópias.

## Backups antes do arranque e recuperação — 2026-10-22

- [x] Guardar dados fora do projeto antes de qualquer paragem do launcher.
- [x] Recuperar ausências sem substituir ficheiros atuais no arranque.
- [x] Validar cópia real local e testes isolados de integridade e recuperação.

Validação: 39 testes de checkpoint, Monitoring e operações aprovados, sintaxe
shell aprovada e primeira cópia real verificada fora do projeto, sem parar
serviços. O restauro completo dos dados reais e o ciclo de paragem/arranque não
foram executados nesta alteração.

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
- [ ] Autorizar e executar separadamente a avaliação real do modelo, com custos,
  privacidade e critérios de aceitação definidos.

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
  incidentes, backups locais/S3 e limpeza conservadora. O portal continua sem
  autenticação própria.
- `just blu up` arranca o ambiente preparado; `just blu it` executa recuperação
  local autenticada. Nenhum dos comandos equivale a deployment de produção.
- Num clone sem cache, `just blu it` materializa o checkpoint ou a release S3
  autorizada. Sem qualquer release válida, só permite uma inicialização vazia
  controlada; não inventa fontes nem recupera trabalho que nunca foi publicado.
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
- [x] Implementar origem S3 e fallback sem acoplar o ETL ao transporte.
- [ ] Aprovar qualquer criação de infraestrutura, custo ou publicação externa.

A comparação de alternativas e os limites atuais estão em
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Pendências de monitoring

A recolha interna, consumo de IA, incidentes e backups locais estão implementados.
O Monitoring continua incompleto para produção até existirem:

- [ ] notificações externas com canal, destinatários, limiares, deduplicação e
  recuperação validados;
- [x] política de retenção S3 encerrada como exceção administrativa: a regra está
  preparada, mas a role da aplicação não pode consultar nem alterar o lifecycle;
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
