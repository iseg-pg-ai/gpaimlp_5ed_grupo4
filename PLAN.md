# Plano de evolução do BLU AI System

Revisto em 25 de outubro de 2026. Este ficheiro contém apenas trabalho aberto,
ordenado pelas dependências reais. Implementações concluídas permanecem no
histórico Git e em [Decisões](docs/DECISIONS.md).

## Etapa 2 — Agente de IA integrado

- [x] Alargar o contrato para treze ações com `update_brief` e
  `update_pending_confirmation`. O primeiro limita-se a oito campos operacionais;
  o segundo apenas prepara horário, local, preço ou fornecedor e nunca confirma,
  recebe contactos/referências/notas ou contorna uma proteção.
- [x] Acrescentar diagnóstico determinístico e sem fornecedores externos ao
  contexto: capacidade, horários, sobreposições, confirmações, catálogo, preços,
  moedas, orçamento e pendências.
- [ ] Validar com Nova Pro o ciclo limitado de ferramentas de leitura
  (`get_trip_context`, `get_itinerary` e `search_approved_catalog`) antes de
  `propose_actions`. A implementação usa apenas o snapshot autoritativo já
  minimizado e mantém a simulação e escrita no portal.
- [x] Acrescentar feedback de simulação ao ciclo: a primeira falha determinística
  é reduzida a um de nove códigos sem texto bruto e permite uma única correção do
  plano completo. O orçamento reserva as duas chamadas possíveis; a segunda
  simulação volta a falhar fechada e nunca executa a proposta.
- [ ] Integrar ranking explicável de candidatos elegíveis, sem transformar a
  ordenação numa alteração e exigindo nova pré-visualização para adicionar.
- [ ] Integrar feedback card a card, sinais de qualidade e casos históricos
  aprovados na base operacional atual; comentários livres e dados pessoais não
  entram no contexto do modelo e nenhum alerta altera o catálogo sozinho.
- [ ] Acrescentar verificação da qualidade do briefing: contradições, campos em
  falta, adequação do orçamento e restrições que exigem esclarecimento.
- [ ] Permitir ao agente preparar exportações e partilhas com o diagnóstico
  preventivo atual. A criação e a partilha mantêm confirmação explícita e o
  agente não envia mensagens nem confirma reservas.
- [ ] Disponibilizar meteorologia já consultada e estimativas de percurso como
  leituras opcionais. Não efetuar consultas externas implícitas nem apresentar
  histórico, estimativas ou ausência de dados como confirmação.
- [ ] Preparar respostas supervisionadas a perturbações e sinais de conteúdo:
  chuva, encerramento, atraso, cancelamento, descrições antigas, duplicados,
  campos em falta e inconsistências linguísticas. Não alterar catálogo, reserva
  ou documento sem o fluxo de aprovação aplicável.
- [ ] Consolidar métricas de propostas, decisões, conflitos, expirações, tokens,
  latência e custos configurados. Não inferir causalidade de edições posteriores
  nem ajustar automaticamente prompts ou ranking.
- [ ] Aprovar fornecedor, modelo, teto mensal e preços atuais para utilização
  real. O código já impõe timeout, limite de saída, orçamento, ausência de
  fallback e falha sem alteração; Bedrock permanece a opção local atual.
- [ ] Autorizar e executar uma avaliação com modelo real, incluindo custos,
  privacidade, os 38 casos sintéticos atuais e limiares de aceitação. Testes
  automáticos usam modelos simulados por defeito.

A memória servidor e o ownership das propostas ficam ativos apenas quando o
backend valida os JWT do ALB e Cognito. No SageMaker, onde não existe esse
principal, o modo de identidade permanece desativado e o portal continua a usar
o contexto recente do navegador sem o tratar como autoridade.

## Etapa 3 — Deployment e operação cloud

- [ ] Implementar a arquitetura aprovada da Etapa 1 com ambientes e dados
  isolados, identidade central e segredos fora do código.
- [ ] Criar CI do portal e uma entrega identificada e reproduzível para todos os
  serviços, sem incluir dados operacionais na imagem.
- [ ] Implementar staging, migrações, smoke tests, promoção e rollback compatível.
- [ ] Validar concorrência, persistência e recuperação no ambiente-alvo, incluindo
  indisponibilidade do SQL/S3 e reconstrução numa máquina nova.
- [ ] Executar testes de segurança, privacidade, custos e carga adequados ao uso
  aprovado.
- [ ] Publicar apenas depois da aprovação operacional e registar o runbook final.

A imagem unificada e o job de build sem publicação já estão preparados. Esta
tarefa permanece aberta até o build passar no GitHub Actions, existir uma política
de SBOM/assinatura e a promoção usar o digest imutável do ECR.
O daemon deste SageMaker bloqueia o build local por política `ImageBuild`; não é
uma autorização para contornar a restrição.

## Etapa 4 — Monitoring externo

- [ ] Executar uma sonda fora da máquina do BLU contra o endpoint estável.
- [ ] Associar a sonda a responsáveis reais e validar indisponibilidade,
  deduplicação, escalamento e recuperação através do SNS já operacional.

O SNS real foi validado em 2026-10-25 com subscrição confirmada e IAM limitado ao
tópico. A sonda externa depende do endpoint produzido pela Etapa 3; logs e sondas
na própria máquina não detetam a indisponibilidade total do ambiente.

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
