# Plano de evolução do BLU AI System

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
  IAM distinta e acesso Bedrock real autorizado.
- [ ] Acrescentar CI do portal para `npm run check` e `npm run build`.
- [ ] Automatizar em ambiente isolado o fluxo catálogo aprovado → ETL → geração →
  confirmação → versão → PDF.
- [ ] Definir gates e exceções auditáveis para qualidade e conflitos das fontes.
- [ ] Rever retenção e compatibilidade das entregas publicadas no CI.

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
