# Plano de evolução do BLU AI System

Revisto em 25 de outubro de 2026. Este ficheiro contém apenas trabalho aberto,
ordenado pelas dependências reais. Implementações concluídas permanecem no
histórico Git e em [Decisões](docs/DECISIONS.md).

## Etapa 1 — Base operacional e multiutilizador

As decisões de base estão aprovadas e registadas em
[Decisões](docs/DECISIONS.md). Antes do agente e do deployment falta:

- [ ] Nomear os responsáveis operacionais e de segurança de staging e produção.
- [ ] Definir o contrato de rascunhos privados sincronizados, incluindo ownership,
  revisão, expiração e resolução de conflitos.
- [ ] Transformar as retenções aprovadas em regras executáveis e testar eliminação
  sem quebrar versões, auditoria ou pedidos legais de preservação.
- [ ] Eliminar a janela entre o commit SQLite e a confirmação S3 ou aprovar um RPO
  que aceite possível perda da outbox se a máquina desaparecer nesse intervalo.
- [ ] Preparar a infraestrutura como código e uma estimativa de custos, sem criar
  recursos até existir autorização explícita de deployment.

A comparação atual e os limites conhecidos estão em
[Operações](docs/OPERATIONS.md).

## Etapa 2 — Agente de IA integrado

- [ ] Definir o âmbito e os critérios de aceitação da próxima iteração do agente.
- [ ] Consolidar `planner.py` e `curator_agent.py` num único percurso de execução,
  mantendo uma só autoridade para contexto, fornecedor e ferramentas.
- [ ] Criar uma interface de fornecedor que preserve o contrato transacional atual
  e permita escolher Bedrock ou OpenAI sem alterar as regras de domínio.
- [ ] Acrescentar ao contexto autorizado os campos de chegada, partida, voos e
  ocasião especial; manter contactos e notas internas excluídos por defeito.
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
