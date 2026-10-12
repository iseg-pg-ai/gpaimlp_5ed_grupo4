# Decisões e questões abertas

Revisto em 2026-10-08. Decisões anteriores válidas preservadas; evidência atualizada
contra o checkout atual de main, commit f090e53.

## D-001 - Distinguir implementação e arquitetura futura

- Estado: aceite; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: ETL, warehouse, Streamlit e DMC Workspace são a base implementada.
  S3, Bedrock, APIs externas e AWS são objetivos futuros.
- Razão: diagramas e experiências não demonstram integração funcional.
- Evidência: etl/pipeline.py, dashboard/app.py e APIs do portal; scripts experimentais.
- Âmbito: arquitetura e planeamento.

## D-002 - Proteger fontes e publicar pelo ETL

- Estado: estabelecido; atualizado em 2026-10-08; data original: 2026-09-29.
- Decisão: Excel/PDF e suplementos são protegidos. O editor escreve na fonte
  operacional data/portal/catalog.sqlite. O ETL lê ambas e publica o warehouse.
- Razão: manutenção com linhagem e entrega validada.
- Evidência local: catalog-store.ts, etl/portal_catalog.py, etl/pipeline.py.
- Âmbito: dados, catálogo e consumidores.

## D-003 - Manter overrides fora dos ficheiros brutos

- Estado: estabelecido; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: overrides revistos ficam em config/curation_rule_overrides.json.
- Razão: regras auditáveis sem alterar fontes originais.
- Evidência: etl/pipeline.py e API itineraries.
- Âmbito: curadoria.

## D-004 - Manter revisão e confirmação humanas

- Estado: aceite; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: geração/comandos produzem propostas; curador regista confirmações e
  evidências. Guardar/exportar não equivale a reservar.
- Razão: preços, horários e acessibilidade podem estar por confirmar.
- Evidência local: activity-confirmation.ts, ActivityConfirmationEditor.tsx,
  docs/PORTAL.md.
- Âmbito: interface, assistente e entrega.

## D-005 - Usar branches por alteração coerente

- Estado: decisão de equipa preservada; destino dos próximos PRs a confirmar.
- Data original: 2026-09-29; revisão: 2026-10-08.
- Decisão: branches curtos e PRs revistos. Política registada usa dev;
  main é a referência funcional desta revisão.
- Razão: preservar revisão sem inventar uma alteração de política.
- Evidência: instrução de equipa registada anteriormente;
  memory/development-workflow.md.
- Âmbito: desenvolvimento Git.

## D-006 - Concentrar operação no DMC Workspace

- Estado: aceite e implementado; revisão em 2026-10-08; data original: 2026-09-29.
- Decisão: briefing, catálogo, proposta, confirmação e exportação no Next.js;
  Streamlit para análise. Google Forms fora do âmbito.
- Razão: fluxo operacional único.
- Evidência: NewTripScreen.tsx, página principal, dashboard/app.py e README.md.
- Âmbito: produto e interfaces.

## D-007 - Gerar com oferta aprovada e publicada

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: draft/review/approved/inactive mantêm revisões e histórico. Apenas
  oferta aprovada e compatível com revisão publicada pode ser elegível.
- Razão: impedir seleção de registos editados/inativos desatualizados.
- Evidência local: catalog-store.ts (isPublished), published-catalog.ts,
  etl/portal_catalog.py.
- Âmbito: catálogo, geração e consistência.

## D-008 - Preservar versões e bytes históricos

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: rascunhos no navegador; versões autoritativas em
  exports/itineraries/history.sqlite, com snapshots, hashes e PDFs persistidos.
  Variantes linguísticas pertencem à mesma versão.
- Razão: auditoria, concorrência e reexportação estável.
- Evidência: version-store.ts, localized-pdf.ts, API versions.
- Âmbito: persistência, backup e exportação.

## D-009 - Explicitar incertezas financeiras e de horários

- Estado: estabelecido no código local; data da revisão: 2026-10-08.
- Decisão: separar valores desconhecidos, moedas, custos calculáveis e orçamento
  disponível. Horários propostos/deslocações são estimativas.
- Razão: evitar zero implícito e falsas confirmações.
- Evidência local: proposal-budget.ts, budget-pdf.ts, itinerary-scheduling.ts.
- Âmbito: geração, interface e PDF.

## D-010 - Assistente determinístico e tradução local

- Estado: estabelecido pela implementação; data da revisão: 2026-10-08.
- Decisão: comandos validados respeitam proteções e não constituem integração LLM.
  Tradução opcional usa subprocesso Python/modelos locais, separando UI e itinerário.
- Razão: explicabilidade e controlo local.
- Evidência local: assistant-editing.ts; local-translation.ts, translations/worker.py.
- Âmbito: assistente e idiomas.

Módulos TypeScript sem prefixo pertencem a dmc-workspace/src/lib/ e componentes
a dmc-workspace/src/components/.

## D-011 - Gerir o prompt de curadoria e exportar plugin de instruções

- Estado: interpretação inicial substituída por D-012; prompt genérico preservado.
- Data: 2026-10-08; definição inicial na conversa de 2026-10-06.
- Decisão: configuração no DMC para editar/guardar/exportar TXT e plugin novo
  blu-curadoria apenas com instruções. Ambos exportam a mesma revisão guardada.
- Razão: reutilizar orientação de curadoria sem introduzir chamadas a modelos.
- Evidência: escolhas explícitas do utilizador, config/prompts/curadoria-blu.txt
  e plugins/blu-curadoria/.
- Âmbito: funcionalidade futura em branch/worktree separado de main; nenhuma
  integração LLM, ligação aos dados ou instalação automática nesta entrega.

## D-012 - Exportar o roteiro guardado para composição no Canva

- Estado: exportação implementada e plugin privado criado em 2026-10-08.
- Decisão: exportar instruções e JSON do snapshot guardado, não apenas orientação
  genérica de curadoria. Usar os PDFs existentes como estrutura e o modelo
  https://canva.link/5u8zxudd1vkcbth como identidade visual.
- Evidência: modelo resolvido para DAHDpPXVRsU, LISBON IN PERSPECTIVE, 87 páginas
  de 672 x 1056; conteúdo e miniaturas inspecionados sem editar o original.
- Limites: excluir contactos, referências e notas internas; preservar incertezas,
  idiomas e moedas. Não copiar os factos de exemplo do modelo para outra viagem.
- Entrega: plugin privado 0.2.0, ID Plugin_600e0d208a74819191cafc6c69a90579,
  com dependência Canva; pacote-fonte em plugins/blu-curadoria/.
- Validação: testes unitários e navegador com API real, histórico imutável e
  layouts 1440/390/320 px. PDF final via Canva ainda não validado numa proposta real.
- Revisão: trabalhar numa cópia e aprovar a pré-visualização antes de aplicar
  alterações quando a ferramenta Canva exigir aprovação.

## D-013 - Integrar dev e rever a entrega TXT/Canva

- Estado: aplicado na pasta ativa em 2026-10-09, sem commit ou push.
- Base: origin/dev em bbd58c8; ficheiros locais reconciliados e backup anterior
  em before-dev-application-20261009, na pasta irmã.
- Decisão: TXT 1.1.0 preserva personalização, capacidade diária, períodos livres
  e percursos guardados. Plugin-fonte 0.3.0 aceita também TXT 1.0.0.
- Lixo: restaurar a versão antes de exportar TXT; não alterar PDFs históricos.
- Entrega: meteorologia dinâmica não é snapshot. PDF Canva, PDF DMC e partilha
  integrada são artefactos distintos. Nova curadoria exige TXT da nova versão.
- Limites: revisão do pacote-fonte não atualiza a instalação do plugin. Serviços
  externos, credenciais e uma proposta real no Canva continuam por validar.
- Correção de auditoria: parents[2] em src/blu_ai/config.py resolve corretamente
  a raiz. A indicação contrária no relatório inicial era um erro de inspeção.

## Questões abertas após integração

### Integração autorizada de dev em plugin_TXT_export — 2026-10-12

- Referências: HEAD inicial `def34fa` e origin/dev atualizado em `ceae821`.
- Manter o branch ativo e incorporar o histórico de dev por merge local.
- Preservar TXT/Canva 1.1.0, snapshots, privacidade e estado de exportação PDF.
- Conciliar caminhos AWS e correções IAM/Bedrock com as melhorias da interface.
- Regenerar o warehouse pelo ETL; testar propostas em armazenamento temporário.
- Evidência e limites em `docs/DEV_TXT_MERGE_VALIDATION.md`.
- Não publicar o branch ou atualizar a instalação Canva sem nova autorização.

- O-001 - Confirmar base dos próximos PRs face à política dev e referência main.
  A responsabilidade operacional Next.js/analítica Streamlit está resolvida.
- O-002 - Definir Bedrock/OpenAI, contratos, avaliação e revisão antes de integrar.
- O-003 - Escolher cenário e fornecedor, termos, custos, evidência e falhas.
  Rotas são hipótese, não decisão.
- O-004 - Definir conteúdo S3, região, encriptação, retenção e fallback.
- O-005 - Definir consentimento, minimização, acesso, logs e eliminação antes de
  partilha pública ou envio de briefs a fornecedores.
- O-006 - Definir política de snapshot/artefacto CI do warehouse.
- O-007 - Definir gates e exceções auditáveis para erros PDF/conflitos estruturados.
- O-008 - Definir provisionamento Python/modelos/fontes em deployment.
- O-009 - Definir partilha, Lixo/restauro, retenção e imagens licenciadas.
- O-010 - Definir autenticação, permissões, sincronização e recuperação.
