# Plano de evolução do BLU AI System

Revisto em 25 de outubro de 2026. Este ficheiro contém apenas trabalho aberto,
ordenado pelas dependências reais. Implementações concluídas permanecem no
histórico Git e em [Decisões](docs/DECISIONS.md).

## Etapa 1 — Base operacional e multiutilizador

As decisões de base estão aprovadas e registadas em
[Decisões](docs/DECISIONS.md). Antes do agente e do deployment falta:

- [ ] Nomear os responsáveis operacionais e de segurança de staging e produção.
- [ ] Introduzir domínio, certificado, imagem e volume de utilização reais, gerar
  a estimativa no AWS Pricing Calculator e aprová-la antes do deployment.

A comparação atual e os limites conhecidos estão em
[Operações](docs/OPERATIONS.md).

## Etapa 2 — Agente de IA integrado

- [ ] Guardar contexto de conversa por utilizador, viagem e versão no servidor,
  com resumo, retenção e eliminação definidos, em vez de depender apenas das
  últimas oito mensagens do navegador.
- [ ] Expor funcionalidades aprovadas do portal como ferramentas tipadas de
  leitura, proposta e escrita, reutilizando os serviços de domínio existentes.
- [ ] Aplicar uma matriz de autorização: leituras automáticas, alterações com
  pré-visualização e aceitação, e operações destrutivas ou administrativas com
  confirmação reforçada.
- [ ] Definir fornecedor, orçamento, privacidade, timeouts e comportamento de
  degradação para utilização real.
- [ ] Autorizar e executar uma avaliação com modelo real, incluindo custos,
  privacidade, casos de teste e limiares de aceitação. Testes automáticos usam
  modelos simulados por defeito.

A memória por utilizador e a matriz de autorização dependem de uma identidade
autenticada no backend. O contrato de papéis já existe, mas o portal SageMaker
atual ainda não fornece um principal fiável; não se deve usar um identificador
enviado pelo frontend como autoridade provisória.

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
- [Agente OpenAI/Codex](agente_codex.md)
- [Testes](docs/TESTING.md)
- [Decisões](docs/DECISIONS.md)
