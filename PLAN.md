# Plano de evolução do BLU AI System

Revisto em 26 de outubro de 2026. Este ficheiro contém apenas trabalho aberto,
ordenado pelas dependências reais. Implementações concluídas e respetiva evidência
ficam em [Decisões](docs/DECISIONS.md) e no histórico Git.

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

A otimização CPU e cache `mode=min` passou no
[CI de a4f0ece](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40249243292).
O job da imagem passou de 25 min 49 s para 3 min 51 s (cerca de 85% menos tempo).
A verificação sem CUDA passou em Python 3.13; imports, cinco testes com mocks e
dois ensaios de tradução real EN/PT passaram localmente em Python 3.12, sem
instalar modelos. O tamanho final da imagem ainda não foi medido.

O [CI de infraestrutura](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40249812920)
passou no commit `8fcea87`, com testes de digest, IAM e limites da API. Os ensaios
CDK usam contexto temporário explícito e lookups desativados, sem depender de
credenciais ou cache local de zonas AWS.

A exportação OCI com SBOM e proveniência passou no
[CI de f1aea3a](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40250526927).
O verificador confirmou hashes, revisão e associação dos documentos ao digest.
A evidência contém 713 pacotes, 852 839 550 bytes de layers comprimidos e
857 447 424 bytes de arquivo OCI. A assinatura continua por verificar.

A assinatura destacada e a verificação estão preparadas em
`curation-sign.yml` e `scripts/image_release.py`: identidade OIDC exata,
origem Portal/dev, ambiente com revisores e hashes da evidência ligados ao digest.
Sete testes locais passaram, incluindo assinatura Cosign com chave temporária e
recusa de adulteração; a identidade keyless real ainda não foi exercitada.

O [CI de assinatura](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40251609640)
passou com sete testes, incluindo assinatura Cosign local e recusa de adulteração.
Os 31 testes de infraestrutura também passaram. Isto não valida a identidade OIDC
real nem cria uma assinatura de release.

- [ ] Integrar a preparação de assinatura revista em `dev`, configurar o ambiente
  `curation-release` com revisores e prevenção de autoaprovação, confirmar acesso
  de leitura à sua configuração e ativar `BLU_RELEASE_SIGNING_ENABLED` apenas
  depois da autorização para assinar. Executar e validar a primeira assinatura
  keyless de uma entrega Portal/dev aprovada. A execução cria um registo público
  Sigstore, sem publicação no ECR ou deployment.
  Política e limites em [Entrega da imagem](infra/IMAGE_DELIVERY.md).
A publicação e a preparação de rollback estão implementadas, sem execução real:
`curation-publish.yml`, `scripts/publish_image_release.py` e
`scripts/prepare_image_rollback.py`. O fluxo valida assinatura e bytes antes de
obter credenciais AWS, preserva manifests/digests e exige tags imutáveis.

O [CI de assinatura/publicação](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40252754115)
passou com 22 testes: AWS e transferência simuladas e assinatura criptográfica
com chave temporária. Os 31 testes de infraestrutura também passaram. Nenhuma
publicação ECR ou assinatura keyless real foi executada.

- [ ] Após a primeira assinatura real, configurar destino ECR, role OIDC e
  proteções do ambiente; rever a política mínima gerada por
  `scripts/prepare_ecr_policy.py` e confirmar o formato real do subject OIDC.
  Não inferir um subject legado para este repositório criado em setembro de 2026.
- [ ] Com autorização, ativar retenção dos bytes OCI em `dev` e publicação manual,
  publicar uma entrega assinada e confirmar o digest no ECR. O arquivo original
  expira em 14 dias; nunca o substituir por uma reconstrução não assinada.
- [ ] Validar transferência real com preservação de todos os manifests, retenção
  permanente da evidência aprovada e preparação da referência anterior assinada.
  O candidato de rollback não valida compatibilidade de dados nem altera serviços.
A configuração `config/curation_services.json` é partilhada pela stack e pelo
smoke da imagem, evitando comandos de arranque divergentes. O CI prepara dados
sintéticos e testa os quatro serviços sem rede externa, com filesystem só de
leitura e volumes temporários; a assinatura exige o resultado positivo no relatório.

- [ ] Confirmar o primeiro smoke real da imagem no GitHub Actions: arranque dos
  quatro serviços, asset JavaScript, adaptador Python, recusa de origem externa
  e autenticação do Monitoring. Os testes locais só simulam o orquestrador.
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
