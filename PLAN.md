# Plano de evolução do BLU AI System
Plano consolidado a partir do registo até 19-10-2026. Foram removidos os blocos de tarefas 
concluídas, resultados repetitivos de testes, pormenores transitórios de sessões, correções 
pontuais e histórico de implementação. Mantêm-se apenas pendências e informação técnica 
que condiciona decisões futuras. O estado deve ser confirmado no branch de trabalho antes 
de executar alterações.

## Estado atual e decisões a preservar
- Portal e dados: portal de curadoria com catálogo, itinerários, versões e entregas;
 warehouse e ETL existentes. Preservar f ontes Excel/PDF originais, revisões e snapshots
  históricos. Evitar alterações a dados reais durante testes: usar armazenamento temporário e
   mocks.
- Assistente BLU: operações estruturadas sobre itinerários, pré-visualização e confirmação 
humana antes de aplicar; catálogo e validações determinísticas continuam a ser a fonte de 
verdade. A implementação das fases 0–6 foi reportada como concluída no branch pc/
assistant-agent-for-blu-curator, não sendo isso prova de integração noutros branches ou de 
validação completa em produção.
- IA: Amazon Bedrock; Nova Pro ficou como modelo predefinido configurável após testes 
limitados. Testes com mocks não demonstram qualidade do modelo real. Não executar chamadas 
pagas sem autorização.
- Observatório: dashboard de leitura e observatório nativo no catálogo, sem alterar fontes 
operacionais. Destinos, unidades, evidência e validade comercial devem conservar valores 
originais e distinguir informação confirmada de desconhecida.
- Monitoring: serviço separado, autenticado, com gestão de utilizadores, sondas, logs 
estruturados do portal/IA, histórico de incidentes, backups locais verificáveis, limpeza 
controlada e tabelas de observabilidade. O portal não tem autenticação própria: 
identificadores de sessão nos logs não identificam pessoas.
- Operação local: SageMaker Studio com portal (3001), apresentação (3003), monitoring (3004), 
Observatório (8501) e agente opcional (8000). Existem comandos just blu it (recuperação 
autenticada) e just blu up (arranque). Isto não equivale a deployment de produção.
- Segurança: não registar prompts, respostas, dados pessoais, segredos nem conteúdo dos 
formulários na telemetria. Credenciais locais ficam fora do Git; houve exposição histórica de 
credenciais versionadas, pelo que importa rodar qualquer palavra-passe ainda em uso.

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


## Onboarding reproduzível — 2026-10-19
- [ ] Validar o percurso completo num segundo espaço SageMaker com uma identidade
  IAM distinta e confirmar o acesso Bedrock real.


## Monitoring e deployment — 2026-10-19
Branch `feat/monitoring-deployment`, criado a partir de `dev` em `aa385fd`,
com diretório limpo. Proposta em [monitoring e deployment](docs/OPERATIONS.md).

- [ ] Definir ambiente-alvo, utilizadores, disponibilidade e orçamento.
- [ ] Corrigir e validar empacotamento Node/Python num ambiente isolado.
- [ ] Definir persistência, backups consistentes e ensaio de restauro.
- [ ] Instrumentar saúde, logs, métricas e alertas com dados minimizados.
- [ ] Preparar CI, staging, promoção e rollback da aplicação e dos dados.

### Desenho e alternativas — 2026-10-19
O utilizador escolheu desenhar a arquitetura e comparar alternativas antes de
implementar.

- [ ] Recolher requisitos de operação e fechar uma decisão fundamentada.

A VM é uma hipótese preliminar, não uma plataforma já escolhida. Sem criação
de infraestrutura, alteração de serviços, custos ou publicação.

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

## Preparação do monitoring para deployment — 2026-10-19
- [ ] Configurar destino externo cifrado para backups no ambiente escolhido.
- [ ] Instalar uma sonda fora da máquina e ligar notificações a responsáveis reais.
