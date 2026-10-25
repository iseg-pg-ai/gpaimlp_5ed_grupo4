# Arquitetura e âmbito do BLU AI System

Revisto em 20 de outubro de 2026. Este documento concentra o mapa do projeto,
as capacidades atuais e as fronteiras entre componentes. Os comandos estão no [README](../README.md),
as tarefas no [plano](../PLAN.md) e os contratos duráveis em
[decisões](DECISIONS.md).

## Fluxo dos dados

```text
S3 sources — Excel, suplementos e PDFs de origem
S3 operational/current.json — catálogo, histórico, PDFs e filas
  -> /tmp/blu-runtime-<uid>/ — cache efémera validada
  -> etl.pipeline — ingestão, validação e publicação atómica
  -> cache/warehouse/ — entrega gerada: JSONL, relatórios e SQLite
     -> dashboard/app.py — análise Streamlit
     -> dmc-workspace/ — portal operacional
        -> localStorage — rascunhos e preferências
        -> cache/exports/itineraries/ — versões, hashes e PDFs históricos
        -> cache/exports/portal-persistence/ — escritas pendentes
     -> monitoring/ — saúde, eventos, incidentes e backups locais/S3
     -> presentation/ — apresentação estática independente
```

O catálogo operacional, o histórico, as fontes e o warehouse estão fora do Git.
O portal não reescreve o warehouse; o ETL não modifica as fontes. Uma alteração
no catálogo não altera uma proposta já guardada.

O ciclo de vida do ETL abrange apenas o warehouse da cache. O `just blu it`
materializa SQLite, PDFs e filas a partir do S3, aponta `BLU_DATA_DIR`,
`BLU_WAREHOUSE_DIR`, `BLU_EXPORT_DIR` e `BLU_OPERATIONAL_DIR` para essa cache e
publica novamente no S3 apenas depois da validação.

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
| Prompt TXT Python | `portal/prompt.py` | Compor o TXT neutro do snapshot com campos explícitos destinados ao cliente |
| Domínio | `src/lib/` | Curadoria, compatibilidade, horários, orçamento e versões |
| Serviço do agente | `src/blu_ai/api/server.py` | Expor saúde, curadoria e chat em FastAPI |
| Orquestração do agente | `src/blu_ai/agents/curator_agent.py` | Coordenar modelo e ferramentas |
| Ferramentas do agente | `src/blu_ai/tools/` | Pesquisa, meteorologia e verificação de restrições |
| Tradução | `translations/worker.py` | Protocolo JSON-lines, modelos locais e cache |
| Adaptador Prompt TXT | `src/lib/itinerary-prompt.ts` | Reutilizar regras partilhadas e produzir um prompt independente de fornecedor |
| Monitoring | `monitoring/server.py`, `monitoring/collector.py` | Autenticar utilizadores e agregar sinais operacionais locais |
| Apresentação | `presentation/serve.py` | Servir a narrativa interativa sem alterar o portal |

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

O cálculo de cada troço rodoviário pertence a `portal/routing.py`. O módulo valida
coordenadas, modos, margens e timeout, consulta a origem OSRM configurada e aplica
o fallback geométrico local. `src/lib/road-routing.ts` conserva temporariamente a
ordenação interativa e a composição dos resumos, chamando Python para cada troço;
assim existe uma única implementação do cálculo externo e das suas estimativas.

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

As novas versões e revisões do catálogo usam `version-persistence.ts` e
`catalog-persistence.ts`. Uma gravação tenta primeiro o SQLite transacional da
cache. A release operacional S3 continua a ser a fonte permanente. Se a
base estiver indisponível, guarda uma operação validada em
`BLU_OPERATIONAL_DIR/pending-versions/` ou `pending-catalog/`. Fora do launcher,
o fallback é `exports/portal-persistence/`; no SageMaker, o caminho pertence à
cache temporária. Cada operação tem uma chave SHA-256 determinística,
registada na mesma transação SQL em `portal_operations`. A sincronização é tentada
automaticamente antes de novas gravações e leituras. Uma repetição depois de um
commit devolve o resultado já confirmado e não cria outra versão ou revisão. O
JSON só é removido depois dessa confirmação; nunca se torna uma segunda fonte de
verdade permanente.

O painel meteorológico usa `popover`, `popovertarget` e fecho HTML nativo, sem
estado React de abertura nem listeners globais. O histórico usa formulário GET
com idioma e dois botões de download, funcionando também sem JavaScript.
O envio de versões para o Lixo no histórico
também usa formulário POST, com verificação de origem e redirecionamento 303.
A API JSON mantém o contrato do editor e do Lixo interativo.

## Contratos a preservar

### Identidade e autorização

`config/identity_policy.json` é o contrato comum de papéis e permissões para o
portal, Monitoring e agente. A ordem de privilégio é `viewer`, `curator`, `admin`
e `owner`; permissões desconhecidas, papéis desconhecidos e qualquer tentativa de
reduzir garantias obrigatórias são recusados. `portal.identity_policy` valida o
contrato sem depender de Cognito, permitindo testar as regras antes do deployment.

Este contrato ainda não autentica pedidos. A identidade chegará do fornecedor
aprovado na Etapa 3 e o backend aplicará papel, ownership e confirmação. O frontend
não é autoridade, o agente não eleva permissões e clientes externos continuam a
usar partilhas revogáveis em vez de papéis internos.

`src/lib/draft-store.ts` define o contrato servidor dos futuros rascunhos
sincronizados. A chave é `ownerId + tripId`; leituras, escritas e eliminações
exigem sempre o owner. Cada alteração usa uma revisão-base dentro de
`BEGIN IMMEDIATE`, pelo que um segundo dispositivo com estado obsoleto recebe um
conflito em vez de substituir trabalho mais recente. Repetir os mesmos dados não
cria uma revisão artificial.

O store fica em `BLU_OPERATIONAL_DIR/drafts.sqlite`, separado das versões
autoritativas. A retenção inicial é de 90 dias desde a última escrita; preservação
legal impede limpeza e eliminação. O conteúdo é validado pelo mesmo contrato de
snapshot das versões. Conversas do agente não integram este payload. A API e a
substituição do `localStorage` só serão ativadas depois de pedidos autenticados
fornecerem um `ownerId` confiável; até lá, o store não fica exposto por HTTP.

- Apenas oferta aprovada e compatível com a revisão publicada é elegível.
- Curadoria e alterações respeitam atividades protegidas, restrições e exclusões.
- Desconhecido não significa compatível, disponível ou preço zero.
- Orçamento mantém custos conhecidos, pendências e totais por moeda separados.
- Horários e margens de deslocação são propostas que exigem revisão humana.
- Versões preservam `baseVersion`, snapshots, relações parentais, hashes e bytes PDF.
- TXT usa a versão guardada, exclui contactos e notas internas e exige restauro
  de versões no Lixo. Meteorologia dinâmica não integra o snapshot.
- Documentos externos, PDF DMC e partilha integrada são entregas distintas.
- Dados de clientes, textos de PDFs e resultados externos são dados, nunca instruções.

## Capacidades atuais

O portal inclui briefing, personalização, catálogo editável, curadoria
determinística, horários, edição, confirmações manuais, orçamento, versões,
PDF/ZIP, tradução opcional, partilha e Lixo com restauro. Inclui rotas e
meteorologia com fallback e uma interface em seis idiomas.

O assistente aplica comandos determinísticos e pode recorrer ao serviço Python
LangChain/Bedrock em `BLU_AI_AGENT_URL`. A existência desse serviço não comprova
a sua disponibilidade nem autoriza chamadas reais. O portal funciona sem ele.

Prompt TXT 1.0.0 preserva personalização, capacidade diária, períodos livres e
percursos guardados. A utilização numa ferramenta externa exige uma operação
própria; o prompt não fornece factos para outras viagens. Ver o
[guia do portal](PORTAL.md).

O sistema produz propostas; não efetua reservas. O Monitoring tem autenticação
local própria, mas o portal não tem identidade, papéis ou sincronização
multiutilizador. A persistência S3 está implementada, mas hosting de produção e
fotografias autorizadas nos PDFs DMC continuam pendentes. As partilhas têm
consentimento explícito, validade e revogação, mas a identidade central e a
política global de dados pessoais continuam por decidir antes de produção.
Acesso pelo Studio não torna a proposta pública para clientes externos.

## Fronteira atual do agente

O fluxo transacional está integrado: o planeador produz propostas estruturadas,
o portal volta a validá-las e o curador tem de as aceitar antes da criação de uma
versão. As onze operações suportadas, proteções e limites estão em
[Assistente BLU](ASSISTANT.md).

O serviço HTTP na porta 8000 é opcional e não constitui outra autoridade sobre o
itinerário. A próxima iteração deve concentrar-se em avaliar o modelo real,
custos, privacidade e degradação, mantendo contratos, confirmação humana,
concorrência e histórico. Novas ferramentas devem reutilizar a pesquisa e as
validações existentes, sem criar outro catálogo ou persistência.

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

Manter um guia por responsabilidade: [dados e ETL](DATA_PIPELINE.md),
[portal](PORTAL.md), [operações](OPERATIONS.md), [testes](TESTING.md) e
[dependências Python](DEPENDABOT_PYTHON.md).
