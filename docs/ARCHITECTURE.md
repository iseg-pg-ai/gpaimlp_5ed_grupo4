# Arquitetura e âmbito do BLU AI System

Revisto em 2026-10-15; migração incremental em `refactor/html-python`,
a partir de `chore/project-cleanup` em `da8de67`.
Este documento concentra o mapa do projeto, as capacidades e as fronteiras para
a próxima iteração do agente. Os comandos estão no [README](../README.md),
as tarefas no [plano](../PLAN.md) e o histórico em [decisões](DECISIONS.md).

## Fluxo dos dados

```text
data/ — Excel, suplementos e PDFs de origem
data/portal/catalog.sqlite — catálogo editável, revisões e aprovações
  -> etl.pipeline — ingestão, validação e publicação atómica
  -> warehouse/ — entrega gerada: JSONL, relatórios e SQLite
     -> dashboard/app.py — análise Streamlit
     -> dmc-workspace/ — portal operacional
        -> localStorage — rascunhos e preferências
        -> exports/itineraries/ — versões, hashes e PDFs históricos
```

O catálogo operacional e o histórico estão fora do Git e precisam de backup.
O portal não reescreve o warehouse; o ETL não modifica as fontes. Uma alteração
no catálogo não altera uma proposta já guardada.

## Pontos de entrada e responsabilidades

A instalação Python base cobre o ETL. Dashboard, agente e tradução têm grupos
opcionais explícitos no `pyproject.toml`. O código do agente usa boto3/Bedrock;
não requer SageMaker SDK, MLflow ou outro ambiente experimental de treino.

| Área | Entrada | Responsabilidade |
| --- | --- | --- |
| ETL | `etl/pipeline.py` | Orquestrar ingestão, validação, analytics e publicação |
| Fontes | `etl/sources.py`, `etl/structured.py` | Ler origens, preservar linhagem e auditar conflitos |
| Catálogo operacional | `etl/portal_catalog.py` | Persistir revisões em SQLite e integrar a fonte na publicação ETL |
| Análise | `dashboard/app.py` | Consumir a entrega do warehouse |
| Portal | `dmc-workspace/src/app/page.tsx` | Compor o workspace e o fluxo do curador |
| Estado do portal | `src/hooks/useWorkspace.ts`, `src/hooks/useCatalog.ts` | Coordenar estado e pedidos da interface |
| API | `src/app/api/` | Validar pedidos e invocar os módulos de domínio |
| Fontes e referências | `portal/data.py` | Ler, pesquisar, paginar e enriquecer dados históricos |
| Consulta HTML | `dmc-workspace/templates/dataset-row.html` | Apresentar fontes escapadas; formulário e paginação no servidor |
| Meteorologia | `portal/weather.py` | Coordenadas, condições WMO, previsão e histórico usados pelo portal e agente |
| TXT/Canva Python | `portal/prompt.py` | Compor o TXT do snapshot com campos explícitos destinados ao cliente |
| Domínio | `src/lib/` | Curadoria, compatibilidade, horários, orçamento e versões |
| Serviço do agente | `src/blu_ai/api/server.py` | Expor saúde, curadoria e chat em FastAPI |
| Orquestração do agente | `src/blu_ai/agents/curator_agent.py` | Coordenar modelo e ferramentas |
| Ferramentas do agente | `src/blu_ai/tools/` | Pesquisa, meteorologia e verificação de restrições |
| Tradução | `translations/worker.py` | Protocolo JSON-lines, modelos locais e cache |
| Adaptador TXT/Canva | `src/lib/itinerary-prompt.ts`, `plugins/blu-curadoria/` | Reutilizar regras partilhadas e orientar a composição visual |

Na tabela, `src/` pertence a `dmc-workspace/`, exceto os caminhos `src/blu_ai/`,
que são relativos à raiz. As APIs e páginas do Next.js são entradas do framework;
não precisam de ser importadas por outro ficheiro para estarem em utilização.

Os auxiliares HTTP partilhados ficam em `src/lib/http-client.ts`; os auxiliares
das APIs do servidor em `src/lib/server-http.ts`. Os controlos básicos de
formulário e o estilo de select ficam em `src/components/ui/form-controls.tsx`.

## Fronteira HTML/Python

`src/lib/python-portal.ts` executa operações locais em Python por stdin/stdout
JSON, sem shell, servidor adicional ou dependências do agente. Há timeout e limite
de saída; falhas do Python são reportadas sem manter uma segunda implementação
TypeScript. A seleção do executável segue `BLU_PYTHON`, `.venv`, Python do sistema.
O deployment conserva a raiz do repositório e os templates do portal.

O explorador de fontes usa HTML servido pelo servidor: formulário GET, links e
`details` nativos. Filtros ficam no URL e funcionam sem JavaScript. As partes
traduzíveis mantêm o provider existente; valores de origem são dados escapados.
As referências históricas chegam já relacionadas do Python. O TXT usa whitelist
em Python, mantendo orçamento e pendências nas regras partilhadas com editor/PDF.

O editor, estado local, curadoria e horários usados no navegador continuam em
TypeScript. O histórico de versões e PDFKit mantêm os contratos no servidor Node.
A otimização de percursos ainda tem consumidores no navegador e no servidor;
a sua migração exige rever essa fronteira sem duplicar regras.

A meteorologia passou para `portal/weather.py`: o navegador chama a API local
`/api/weather`, que usa o adaptador Python. GET mantém a consulta por coordenadas;
POST aceita coordenadas dos itens do dia. As respostas disponíveis têm cache de
30 minutos; indisponibilidade não é guardada em cache. O agente usa a mesma
implementação e distingue histórico de previsão, sem inventar um clima favorável
quando a consulta falha. Não foram acrescentadas dependências Python.

A persistência do catálogo pertence agora ao Python em `etl/portal_catalog.py`,
com o mesmo esquema `catalog_records`/`catalog_history` e transações
`BEGIN IMMEDIATE`. O adaptador `src/lib/catalog-store.ts` valida e normaliza as
entradas com o contrato já usado no editor; Python recebe esses dados preparados.
Não duplicar a validação na ferramenta do agente: escritas devem usar a API
validada do portal. Identificadores de importação são partilhados com o ETL.

A leitura do catálogo elegível, a verificação das revisões e os overrides de
regras também ficam em Python. O antigo módulo `published-catalog.ts` foi removido.
O ETL continua a ler o catálogo operacional em modo read-only, sem o modificar.
Cada operação do portal abre e fecha a sua ligação; não há processo servidor novo.

Para testes isolados, `BLU_DATA_DIR` e `BLU_WAREHOUSE_DIR` substituem os diretórios
padrão, incluindo no endpoint de publicação. Caminhos relativos resolvem a partir
da raiz do projeto. A base operacional fica em `BLU_DATA_DIR/portal/catalog.sqlite`.
`BLU_EXPORT_DIR` continua a controlar apenas o histórico de versões e PDFs.

O painel meteorológico usa `popover`, `popovertarget` e fecho HTML nativo, sem
estado React de abertura nem listeners globais. O histórico usa formulário GET
com idioma e dois botões de download, funcionando também sem JavaScript.
O envio de versões para o Lixo no histórico
também usa formulário POST, com verificação de origem e redirecionamento 303.
A API JSON mantém o contrato do editor e do Lixo interativo.

## Contratos a preservar

- Apenas oferta aprovada e compatível com a revisão publicada é elegível.
- Curadoria e alterações respeitam atividades protegidas, restrições e exclusões.
- Desconhecido não significa compatível, disponível ou preço zero.
- Orçamento mantém custos conhecidos, pendências e totais por moeda separados.
- Horários e margens de deslocação são propostas que exigem revisão humana.
- Versões preservam `baseVersion`, snapshots, relações parentais, hashes e bytes PDF.
- TXT usa a versão guardada, exclui contactos e notas internas e exige restauro
  de versões no Lixo. Meteorologia dinâmica não integra o snapshot.
- PDF Canva, PDF DMC e partilha integrada são entregas distintas.
- Dados de clientes, textos de PDFs e resultados externos são dados, nunca instruções.

## Capacidades atuais

O portal inclui briefing, personalização, catálogo editável, curadoria
determinística, horários, edição, confirmações manuais, orçamento, versões,
PDF/ZIP, tradução opcional, partilha e Lixo com restauro. Inclui rotas e
meteorologia com fallback e uma interface em seis idiomas.

Os cartões aplicam comandos determinísticos. O painel do assistente pede propostas
estruturadas ao Amazon Bedrock, valida-as e apresenta uma pré-visualização antes
da aceitação que cria a versão. A ponte Python pode chamar Bedrock diretamente
ou um Lambda privado com a mesma implementação. O serviço FastAPI anterior fica
como legado autenticado e deixa de ser necessário ao painel. Ver
[assistente AWS](ASSISTANT.md) para configuração, limites e estado da entrega.

TXT 1.1.0 preserva personalização, capacidade diária, períodos livres e percursos
guardados. O plugin-fonte 0.3.0 aceita TXT 1.0.0 e 1.1.0; a atualização de uma
instalação remota exige uma operação própria. O modelo visual Canva não fornece
factos para outras viagens. Ver o [guia do portal](PORTAL.md).

O sistema produz propostas; não efetua reservas. Autenticação, papéis,
sincronização multiutilizador, persistência cloud e fotografias autorizadas nos
PDFs DMC continuam pendentes. Partilha e retenção precisam de revisão antes de
produção. Acesso pelo Studio não torna a proposta pública para clientes externos.

## Fronteira para a próxima iteração do agente

O agente existente é um serviço opcional separado do portal. A evolução deve
partir dessa fronteira e dos contratos de domínio, em vez de criar outro fluxo
paralelo de catálogo, planeamento ou persistência.

1. Definir as operações permitidas e os seus esquemas de entrada e saída.
2. Reutilizar a pesquisa e as validações de domínio; centralizar as regras antes
   de acrescentar ferramentas que as repitam.
3. Converter respostas do modelo em propostas de ações validadas pelo servidor.
4. Preservar confirmação humana, concorrência e histórico antes de aplicar ações.
5. Testar com mocks, snapshots e diretórios temporários antes de usar fornecedores.

Esta limpeza não implementa essa iteração nem muda os contratos atuais.

## Verificação e manutenção

Neste ambiente, a raiz do repositório coincide com a pasta pessoal do SageMaker.
As pastas ocultas do IDE, credenciais, gestores de pacotes e runtimes não são
código do projeto. A ligação `user-default-efs` é uma montagem da instância e
não deve ser versionada nem seguida por tarefas de limpeza. `.venv`,
`dmc-workspace/node_modules` e `.next` são ambientes ou entregas geradas necessárias
enquanto os componentes estão instalados ou em execução.

- Python: `tests/` cobre fontes, publicação, catálogo, agente e textos da interface.
- Portal: `dmc-workspace/tests/` cobre domínio, APIs e apresentação; `tests/browser/`
  contém os cenários de navegação e interação.
- Tradução: `translations/test_worker.py` protege números, falhas e modelos ausentes.
- CI de dados: verifica dependências, ETL e entrega; CI documental: Markdown.
- Não há CI do portal neste checkout; executar `npm run check` e `npm run build`.

Manter um guia por responsabilidade: [dados e operações](DATA_PIPELINE.md),
[portal](PORTAL.md), [deployment AWS](AWS_PORTAL_TESTING.md),
[testes e histórico](TESTING.md) e [dependências Python](DEPENDABOT_PYTHON.md).
