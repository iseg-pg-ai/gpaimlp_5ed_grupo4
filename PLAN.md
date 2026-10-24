# Plano de evolução do BLU AI System

Revisto em 24 de outubro de 2026. Este ficheiro contém apenas trabalho aberto.
Implementações e validações concluídas permanecem no histórico Git e em
[Decisões](docs/DECISIONS.md).

## Prioridade 2 — Agente de IA

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
- [ ] Expor as funcionalidades aprovadas do portal como ferramentas tipadas de
  leitura, proposta e escrita, reutilizando os serviços de domínio existentes.
- [ ] Definir uma matriz de autorização: leituras automáticas, alterações com
  pré-visualização e aceitação, e operações destrutivas ou administrativas com
  confirmação reforçada.
- [ ] Definir fornecedor, orçamento, privacidade, timeouts e comportamento de
  degradação para utilização real.
- [ ] Autorizar e executar a avaliação com um modelo real, incluindo custos,
  privacidade, conjunto de casos e limiares de aceitação. Os testes automáticos
  continuam a usar modelos simulados por defeito.

## Prioridade 3 — Entrega ao cliente

- [ ] Numa sessão Canva autorizada, validar uma entrega real completa: TXT →
  cópia Canva → revisão humana → PDF final. Registar a versão instalada antes de
  importar o pacote-fonte 0.4.1 e conservar o pacote anterior para rollback.

## Prioridade 4 — Operação multiutilizador e cloud

- [ ] Definir o ambiente-alvo, utilizadores, identidade, papéis e permissões.
- [ ] Aprovar objetivos de disponibilidade, perda máxima de dados e tempo máximo
  de recuperação.
- [ ] Decidir se os rascunhos devem permanecer privados em cada navegador ou ser
  sincronizados entre utilizadores. Catálogo e versões já foram validados com
  processos SQLite independentes e recusam corretamente escritores obsoletos.
- [ ] Eliminar a janela entre o commit SQLite e a confirmação S3, ou aprovar um RPO
  que aceite a possível perda da outbox se a máquina desaparecer nesse intervalo.
- [ ] Decidir se os checkpoints devem continuar integrais ou passar a conservar
  apenas estado operacional. O contrato atual duplica fontes e warehouse já
  existentes no bucket de dados e pode gerar cerca de 1 GB por `just blu it`.
- [ ] Definir minimização, retenção e eliminação de dados pessoais.
- [ ] Escolher hosting, persistência, gestão de segredos, região, staging e rollback.
- [ ] Aprovar antes de criar infraestrutura, gerar custos ou publicar serviços.

A comparação de alternativas e os limites atuais estão em
[Operações](docs/OPERATIONS.md).

## Prioridade 6 — Monitoring

O Monitoring continua incompleto para produção até concluir:

- [ ] Configurar e validar notificações externas, incluindo canal, destinatários,
  limiares, deduplicação, tentativas e recuperação após falha.
- [ ] Executar uma sonda fora da máquina do BLU e associá-la a responsáveis reais.

Envios reais e infraestrutura externa exigem autorização aplicável. Logs, sondas
locais e incidentes no painel não encerram estas duas tarefas sem evidência de
execução externa.

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
