# Plano de evolução do BLU AI System

Revisto em 26 de outubro de 2026. Este ficheiro contém apenas trabalho aberto,
ordenado pelas dependências reais. Implementações concluídas e respetiva evidência
ficam em [Decisões](docs/DECISIONS.md) e no histórico Git.

A Etapa 2 do agente está concluída segundo a avaliação registada. As melhorias
locais do concierge e da confiança IAM do Backoffice passaram os testes locais,
mas essa validação não demonstra publicação nem comportamento de serviços reais.

## Integração de segurança — validação externa pendente

As alterações locais de `fix/security-hardening` foram integradas seletivamente:
origem nos POST sensíveis, helper nas partilhas, limites da API pública, testes,
caminhos temporários do workflow ETL e exclusões CDK/npm. Foram preservados o gate
completo de warehouse e a retenção de 14 dias. Evidência em
[Decisões](docs/DECISIONS.md).

- [ ] Após autorização de publicação, validar os limites da API e a recusa de
  origens externas nos serviços reais. A síntese local não comprova deployment.

## 1. Decisões necessárias para a próxima entrega

- [ ] Rever em grupo as propostas de [intranet](docs/INTRANET.md) e
  [API de leads](docs/LEADS_API.md), definindo o âmbito da primeira entrega.
  As propostas ainda não constituem implementação nem aprovação de deployment.
- [ ] Conciliar a proposta de manter o DMC local com o deployment do portal
  já previsto em [Operações](docs/OPERATIONS.md). Registar a decisão antes de
  criar outra interface ou fluxo de autenticação.
- [ ] Definir se a API de leads será o primeiro módulo de `BluCostaIntranet`
  ou uma stack autónoma. Unificar saídas, callbacks, CORS, grupos e contratos;
  resolver também a divergência entre tratar `status` inválido como `open`
  e devolver `400` na especificação da API.

## 2. Etapa 3 — Entrega reproduzível e operação cloud

O commit `31a6eb5` passou os jobs `validate` e `container` no
[GitHub Actions](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40245742304).
O ETL passou na execução de `d176a56`. A construção é sem publicação e não
comprova entrega no ECR nem funcionamento dos serviços cloud.

A otimização seguinte troca PyTorch por wheels CPU em Linux/Windows e a cache
Docker por `mode=min`. O lockfile deixa de incluir 19 pacotes GPU. Imports reais
e cinco testes com modelos simulados passaram num ambiente temporário Python
3.12; dois ensaios de inferência local EN/PT também passaram com os modelos
já instalados, preservando hora e montante. A imagem usa Python 3.13 e precisa
de confirmação em CI.

- [ ] Construir a imagem CPU e comparar duração e tamanho com a referência.
  A construção anterior demorou cerca de 26 minutos, incluindo exportação de
  cache; não foi medido o tamanho final da imagem. Preservar tradução offline e
  validar uma tradução com os modelos locais autorizados antes de produção.
- [ ] Definir e implementar geração de SBOM, assinatura e verificação da imagem.
- [ ] Preparar publicação identificada no ECR, verificação de assinatura e
  promoção/rollback por digest. A stack já exige SHA-256 na conta/região alvo,
  recusa tags e regista `ImageUri`; a execução real continua pendente.
- [ ] Preparar os parâmetros de staging: domínio/subdomínios, DNS, certificado
  ACM, grupos/utilizadores, segredos e isolamento de ambientes e dados.
- [ ] Rever o diff da infraestrutura e publicar staging apenas com autorização
  aplicável. Validar TLS, Cognito, papéis, ownership e autorização no backend.
  A memória servidor do agente depende dessa identidade validada; no SageMaker
  permanece desativada, com contexto recente apenas no navegador.
- [ ] Implementar o fluxo de migrações, smoke tests, promoção e rollback,
  preservando a compatibilidade dos dados com a versão anterior.
- [ ] Validar no ambiente-alvo concorrência, escritora única, persistência,
  backups e restauro; simular indisponibilidade do armazenamento operacional
  e S3 e reconstruir numa máquina nova sem perder revisões ou PDFs.
- [ ] Executar os testes de segurança, privacidade, custos e carga definidos
  para o uso aprovado, com evidência e limites de aceitação.
- [ ] Obter aprovação operacional antes de produção e atualizar o runbook com
  a entrega, os responsáveis, recuperação e rollback efetivamente validados.

O daemon deste SageMaker bloqueia o build local por política `ImageBuild`.
A validação deve usar o fluxo permitido de CI, sem contornar a restrição.

## 3. Backoffice e concierge — validação e publicação pendentes

- [ ] Definir os ARNs autorizados em `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS` e
  rever o template/diff antes de atualizar o Backoffice. Sem a lista, o papel
  de análise não é criado; a alteração local não corrige papéis já publicados.
- [ ] Publicar as alterações do concierge e do Backoffice com autorização e
  validar o fluxo com dados de teste: detalhes conhecidos sem perguntas
  repetidas, temas em Portugal, datas legíveis, consentimento e ausência da
  referência interna na interface. Não prometer disponibilidade nem preços.
- [ ] Validar na AWS a confiança IAM restrita e a ausência de acesso através
  de papéis partilhados não autorizados. Distinguir esta evidência da síntese
  CDK e dos testes locais já aprovados.

## 4. API de leads autenticada — após decisão de âmbito

A página e as rotas locais de Leads já existem. `leads.ts` ainda consulta
DynamoDB com as credenciais do ambiente; a API Cognito proposta não existe.

- [ ] Implementar Cognito com MFA, grupos, callbacks por ambiente e API com
  autorizador JWT, limitação de pedidos e IAM mínimo sobre as tabelas existentes.
- [ ] Implementar lista, detalhe, marcação de contacto e etiquetas/notas segundo
  o contrato aprovado, com validação, paginação, condições de escrita e logs
  sem contactos, mensagens, notas ou tokens.
- [ ] Adaptar o portal para chamar a API pelo servidor, com login/callback/logout,
  PKCE/state, cookies protegidos, renovação de sessão e tratamento de 401/403.
  Preservar as proteções atuais de identidade e a compatibilidade com o proxy
  SageMaker; reutilizar os modelos de Leads existentes.
- [ ] Executar testes com mocks de API, autenticação e autorização; check/build
  do portal, síntese IAM e cenários de navegador com sessão expirada e sem grupo.
- [ ] Com autorização, validar na AWS 401/403, leitura/escrita por curador,
  recusa IAM de atributos não permitidos e ausência de dados pessoais nos logs.

## 5. Intranet — fases condicionadas à aprovação da proposta

Reutilizar os dados e serviços existentes; não criar persistência paralela.
Cada fase exige testes locais antes de publicação e aceitação no ambiente-alvo.

- [ ] F0: estrutura React/Vite, navegação, stack e login Cognito com MFA,
  autorização por grupo, CORS restrito e configuração por ambiente.
- [ ] F1: acompanhamento de leads e tarefas, responsável e filtro pessoal,
  reutilizando o módulo de API aprovado e validando as permissões de atualização.
- [ ] F2: indicadores agregados do funil, exclusão de sintéticos dos indicadores
  reais e modo demo separado, sem expor contactos ou transcrições.
- [ ] F3: manifesto de governança com fonte única em `config/` e apresentação
  de controlos/evidências; rever os mapeamentos propostos sem alegar certificação.
- [ ] F4: leitura da wiki aprovada e perguntas ao RAG com revisão humana.
- [ ] F5: rascunhos e aprovação da wiki com separação de grupos, sanitização,
  recusa de dados pessoais e versões recuperáveis na fonte S3 existente.
- [ ] F6: operações só de leitura: filas, DLQ, última avaliação e erros agregados.
- [ ] Validar permissões por rota/grupo e a interface a 390/1440 px com mocks;
  após autorização, executar a aceitação AWS e confirmar orçamento e reversão.

## Pendências de monitoring

Esta secção é a fonte de verdade da Etapa 4. O SNS real foi validado em
2026-10-25, com subscrição confirmada e IAM limitado ao tópico. Monitoring
externo continua incompleto e depende do endpoint estável da Etapa 3.

- [ ] Instalar e executar uma sonda fora da máquina do BLU contra o endpoint
  estável, capaz de detetar indisponibilidade total do ambiente.
- [ ] Atribuir responsável primário, substituto, canal e prazo de resposta,
  registando-os no [runbook](docs/MONITORING_RUNBOOK.md).
- [ ] Validar indisponibilidade, deduplicação, escalamento e recuperação através
  do SNS, com evidência de receção e atuação dos responsáveis.
- [ ] Acompanhar a falha residual de resposta incompleta do Nova Pro registada
  na avaliação híbrida e definir o tratamento operacional dessa indisponibilidade.

Logs e sondas na própria máquina não concluem estas pendências.

## Contratos a preservar

- O catálogo e as validações determinísticas são a fonte de verdade; a IA propõe
  ações sujeitas a validação e confirmação humana.
- O S3 conserva as releases permanentes; a máquina usa uma cache reconstruível
  fora do repositório.
- O ETL publica o warehouse validado sem controlar o estado operacional do portal.
- `just blu up` inicia o ambiente preparado; `just blu it` executa recuperação
  autenticada. Nenhum dos comandos constitui deployment de produção.
- Segredos, dados de clientes, prompts, respostas, exports e runtimes ficam fora
  do Git e dos logs.

## Referências

- [Arquitetura](docs/ARCHITECTURE.md)
- [Dados e ETL](docs/DATA_PIPELINE.md)
- [Operações](docs/OPERATIONS.md)
- [Portal](docs/PORTAL.md)
- [Âmbito funcional do BLU Agent](docs/AGENT_SCOPE.md)
- [Implementação do assistente Nova Pro](docs/ASSISTANT.md)
- [Testes](docs/TESTING.md)
- [Decisões](docs/DECISIONS.md)
