# Âmbito do produto e implementação

Revisto em 2026-10-09 contra a integração de origin/dev, commit bbd58c8,
aplicada ao worktree da pasta ativa com o fluxo TXT/Canva atualizado.

## Objetivo

Transformar briefing e conhecimento BLU em propostas explicáveis, editáveis e
versionadas. Next.js DMC Workspace é o portal operacional; Streamlit é analítico.
Briefing, catálogo, revisão e exportação pertencem ao portal. Google Forms fica
fora do âmbito.

## Capacidades desenvolvidas

Todos os módulos da tabela existem na pasta atual. Caminhos src/ pertencem a
dmc-workspace/; componentes sem prefixo estão em src/components/.

| Capacidade | Estado | Evidência |
| --- | --- | --- |
| Ingestão Excel/PDF e linhagem | Implementada localmente | etl/sources.py, etl/pipeline.py |
| Warehouse validado e publicação atómica | Implementado | etl/validation.py, etl/pipeline.py |
| KPIs e análise Streamlit | Implementados | etl/analytics.py, dashboard/app.py |
| Briefing e curadoria determinística | Implementada localmente | NewTripScreen.tsx, src/lib/curation.ts |
| Catálogo editável, aprovação e histórico | Implementado localmente | src/lib/catalog-store.ts, src/app/catalog/page.tsx |
| Catálogo operacional no ETL | Implementado localmente | etl/portal_catalog.py, src/lib/published-catalog.ts |
| Personalização e compatibilidade | Implementado localmente | src/lib/brief-personalization.ts, src/lib/catalog-matching.ts |
| Horários e conflitos conservadores | Implementados, com limites | src/lib/itinerary-scheduling.ts |
| Confirmações manuais e evidência | Implementado localmente | src/lib/activity-confirmation.ts |
| Comandos do assistente | Implementados localmente | src/lib/assistant-editing.ts, src/lib/curation.ts |
| Versões imutáveis e PDF/ZIP | Implementada localmente | src/lib/version-store.ts |
| Orçamento discriminado | Implementado localmente | src/lib/proposal-budget.ts, src/lib/budget-pdf.ts |
| Tradução local e variantes | Implementadas; instalação opcional | translations/worker.py, src/lib/localized-pdf.ts |
| Navegação responsiva e fontes | Implementado localmente | ResponsiveNavigation.tsx, DatasetExplorer.tsx |
| Partilha por ligação/PDF | Implementada; acesso de produção por rever | src/app/api/shares/route.ts, ShareProposalModal.tsx |
| Lixo e recuperação de viagens/versões | Implementados localmente | src/lib/trip-trash.ts, src/lib/version-store.ts, src/app/trash/page.tsx |
| Rotas e meteorologia | Implementadas com fallback | src/lib/road-routing.ts, src/lib/weather.ts |
| Serviço LLM do assistente | Integrado; execução externa não validada | src/app/api/assistant/route.ts, src/blu_ai/api/server.py na raiz |

Implementação e testes presentes não equivalem a aprovação de produção.

## Limites atuais

- Propostas/horários não são reservas nem confirmação automática do fornecedor.
- Desconhecido não significa preço zero ou compatibilidade positiva.
- Totais mantêm moedas separadas e distinguem custo de orçamento disponível.
- Deslocações podem usar rotas calculadas; tempos, margens e acessibilidade exigem revisão.
- Atividades protegidas/confirmadas restringem alterações do assistente.
- O assistente aplica comandos determinísticos e tem fallback para um serviço LLM separado.
- Armazenamento local/navegador não oferece sincronização multiutilizador.
- Traduções/PDFs podem exigir Python, modelos locais e fontes CJK adicionais.

## Por desenvolver

Fotografias autorizadas em PDFs DMC, autenticação, sincronização e persistência
cloud permanecem pendentes. Partilha e Lixo estão presentes, mas precisam de
revisão operacional e de acesso para produção. O serviço Python LangChain/Bedrock
foi integrado em dev; a execução com credenciais reais não foi validada.

O diagrama anterior orienta possibilidades; não define contratos aprovados.
Fornecedores, responsabilidades Bedrock/OpenAI, custos, privacidade e persistência
cloud continuam decisões abertas.

## Prompt TXT e plugin

A proposta atual pode ser guardada e descarregada como TXT; o histórico também
oferece TXT por versão. `src/lib/itinerary-prompt.ts` produz instruções e JSON a
partir do snapshot guardado, via API versions com `format=prompt`.
Preços desconhecidos, moedas, restrições e pendências são preservados; contactos,
referências de reserva e notas internas ficam excluídos. Isto não anonimiza o
nome do cliente nem outros dados necessários à proposta.

O plugin privado [BLU | Roteiros no Canva](https://chatgpt.com/plugins/Plugin_600e0d208a74819191cafc6c69a90579)
foi criado na versão 0.2.0; o pacote-fonte local foi revisto para 0.3.0 e aguarda
atualização da instalação. Recebe o TXT anexado, sem acesso
automático ao portal. O modelo LISBON IN PERSPECTIVE, design DAHDpPXVRsU, orienta
o visual; os PDFs existentes orientam a estrutura e o snapshot fornece os factos.
O original é preservado. Nenhuma proposta real foi ainda produzida/exportada
através deste fluxo Canva. O prompt genérico anterior é apoio secundário.

TXT 1.1.0 preserva períodos livres, personalização estruturada, capacidade diária
e resumos de deslocações do snapshot. O plugin aceita também 1.0.0. Meteorologia
dinâmica e ligações de partilha não são exportadas. Versões no Lixo exigem restauro.
O PDF Canva não substitui os PDFs históricos nem atualiza a partilha integrada DMC.

## Critério de evolução

Consolidar catálogo aprovado -> warehouse -> briefing -> proposta -> confirmação
manual -> versão -> PDF reproduzível. Acrescentar serviços com contratos, mocks,
evidência e degradação explícita. O curador mantém a decisão final.
Consultar PLAN.md e decisions.md para prioridades e escolhas pendentes.
