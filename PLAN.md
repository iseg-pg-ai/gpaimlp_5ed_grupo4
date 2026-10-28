# Preparação do branch para produção

Revisto em 28 de outubro de 2026. Por decisão do utilizador, este plano substitui
as pendências anteriores e concentra o trabalho nos nove pontos abaixo. A remoção
de uma pendência não constitui evidência de conclusão. O histórico permanece no
Git e as decisões duráveis em [Decisões](docs/DECISIONS.md).

Antes de promover o branch, fechar a validação funcional e a preparação
operacional. O segundo workspace prova capacidade de instalação e recuperação,
mas não comprova produção. Cada ponto só deve ser concluído com evidência relativa
ao candidato e ao ambiente em avaliação.

## 1. Âmbito da entrega

- [x] Âmbito definido pelo utilizador em 28 de outubro de 2026: todos os
  componentes existentes, incluindo portal DMC, agente, tradução, Monitoring,
  apresentação, Observatório, ETL, site público, Leads/concierge e Backoffice.
- [x] DMC e portal são a mesma aplicação. A intranet proposta não acrescenta um
  novo desenvolvimento a esta entrega; o âmbito abrange os componentes existentes.
- [ ] Confirmar por componente o ambiente-alvo, a exposição pública ou interna,
  a identidade, as dependências e os critérios de aceitação antes da promoção.

### Levantamento inicial — 28 de outubro de 2026

- `dmc-workspace/` é o portal DMC; não são duas aplicações distintas.
- `config/curation_services.json` e `infra/curation-workspace.mjs` definem uma
  entrega de curadoria com portal, Monitoring, apresentação e Observatório.
  Agente e tradução são executados pelo portal; ETL é um fluxo de dados.
- `infra/aws-split-app.mjs` define separadamente `BluCostaData`,
  `BluCostaFrontend` e `BluCostaBackoffice`. A presença de rotas Leads no portal
  obriga a verificar essa dependência mesmo que a publicação desse fluxo fique
  fora do âmbito.
- O utilizador escolheu a entrega completa, incluindo Leads/concierge e
  Backoffice. A revisão cobre ambas as infraestruturas e a integração entre elas.
- `.github/workflows/portal.yml` contém validação, build, ciclo de catálogo/ETL
  e construção da imagem. A existência do workflow não confirma a sua execução
  bem-sucedida no candidato.

## 2. Integração com dev

- [x] Comparar o branch com o remoto atual e preparar a resolução dos conflitos
  num checkout isolado, preservando as alterações locais. A integração no branch
  continua pendente.
- [ ] Identificar o commit candidato. Verificar novamente os conflitos, sem
  assumir que a simulação anterior representa o estado atual.

Comparação atualizada em 28 de outubro de 2026 após `git fetch origin dev`:
HEAD `0dc7f2b`, branch `integration/gisela-dev-pc`; `origin/dev` em `e4c1332`.
Há dez commits exclusivos de `origin/dev` e 67 exclusivos de HEAD.
A simulação `git merge-tree --write-tree --name-only HEAD origin/dev`, sem
alterar o checkout, identificou oito ficheiros em conflito:

- `docs/ONBOARDING.md`;
- `frontend/blu-cloud-site/public/config.js`;
- `frontend/blu-cloud-site/src/App.jsx`;
- `frontend/blu-cloud-site/src/styles.css`;
- `infra/lambda/chat/index.mjs`;
- `infra/lambda/chat/prompt.mjs`;
- `infra/tests/chat.test.mjs`;
- `infra/tests/frontend.test.mjs`.

Resolução preparada em `/tmp/blu-production-integration`, em HEAD destacado,
com merge sem commit e oito conflitos resolvidos. O branch original e as suas
alterações documentais permanecem intactos. Patch em
`/tmp/blu-production-integration.patch`; árvore preparada
`8f05d82feae73e280a200dc518151cde2319bd8e`.

Foram preservados o contexto da viagem, consentimento, sugestões, atribuição,
modo sintético e proteção contra respostas antigas do concierge. A configuração
pública conserva os endpoints vazios de `dev`, preenchidos no deployment pela
stack. Caches CDK ignoradas não entram na integração; o README alternativo foi
consolidado em ligações aos guias atuais, sem domínio privado nem instruções
antigas sobre a porta 8000.

Validação local com Node 22.13.0: build do site, quatro testes de packaging,
31 testes de infraestrutura sem omissões, dois cenários de navegador do build
(375/1440 px) com mocks e sem chamadas externas, estrutura/ligações e Markdown
sem erros. Os cenários cobriram contexto, consentimento, eventos sintéticos,
atribuição e reinício durante pedido pendente. Não foi executado commit, push,
deployment ou merge no branch original. O candidato final e o CI continuam
pendentes; esta evidência não substitui a bateria completa do ponto 4.

## 3. Instalação reproduzível

- [ ] Concluir o novo ensaio com URL real, Node >=22.13 e <25, preferindo Node
  24 LTS, dependências bloqueadas e testes finais aprovados.
- [ ] Confirmar no segundo workspace a correção visual da barra de progresso.

## 4. Testes do candidato

- [ ] Executar os testes Python, `check` e `build` do portal, catálogo/ETL quando
  aplicável e os cenários de navegador relevantes.
- [ ] Confirmar CI Linux/Windows no commit final, sem usar resultados de commits
  anteriores como aprovação do candidato.

## 5. Segurança e identidade

- [ ] Confirmar as correções Dependabot após integração.
- [ ] Validar autenticação, autorização no backend, isolamento de utilizadores,
  origens e limites da API.
- [ ] Definir a identidade de produção; a role de ensino partilhada foi aceite
  para o ensaio e não constitui uma decisão de produção.

## 6. Dados e recuperação

- [ ] Validar concorrência, escritora única, migrações, outbox, backups e restauro
  sem perder aprovações, revisões ou bytes PDF.
- [ ] Definir retenção, RPO e RTO aceites.

## 7. Entrega e infraestrutura

- [ ] Fechar assinatura real, publicação ECR e verificação do digest.
- [ ] Preparar staging com DNS, TLS, segredos e dados isolados; testar o artefacto
  que será promovido.

## 8. Funcionalidades entregues

- [ ] Validar os fluxos reais de guardar/reabrir, aprovar, exportar TXT/PDF e
  traduzir.
- [ ] Incluir fonte CJK e inspeção do PDF mandarim se fizer parte da entrega.

## 9. Rollback e operação

- [ ] Ensaiar reversão de código com compatibilidade de dados.
- [ ] Definir responsáveis, custos, limites de carga e aprovação operacional.

### Pendências de monitoring

A avaliação de monitoring integra a preparação operacional desta entrega.
O estado anterior não equivale a monitoring completo; a conclusão exige
implementação e validação no ambiente-alvo.

- [ ] Avaliar e validar a cobertura de monitoring, a deteção de indisponibilidade
  total e o fluxo de alertas e resposta dos responsáveis.

## Evidência e autorização

Registar para cada ponto o commit, ambiente, resultado e limitações, distinguindo
mocks, execução local e serviços reais. A preparação deste plano não autoriza
commit, push, merge, assinatura, publicação ou deployment; essas operações seguem
a autorização aplicável na conversa.
