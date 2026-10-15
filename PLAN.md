# Plano de evolução do BLU AI System

## Base do assistente — integração de 2026-10-15

- [x] Atualizar referências e selecionar `pc/assistant-agent-for-blu-curator`.
- [x] Integrar `refactor/html-python`, preservando a entrega completa de
  `warehouse/` do destino na resolução dos conflitos de ficheiros gerados.
- [x] Rever o serviço existente e `BLU_ASSISTANT_PLAN.md`.
- [x] Validar a base integrada antes de implementar as Fases 0 e 1.
- [ ] Propor ações estruturadas, pré-visualizar e confirmar antes de aplicar.

O plano específico tem avaliações anteriores à migração; confirmar as premissas
no código. Reutilizar o catálogo Python e as validações do portal. Modelos usam
mocks nesta preparação, sem chamadas pagas.

## Limpeza após migrações — 2026-10-15

- [x] Remover adaptadores e operações sem consumidores de produção.
- [x] Consolidar testes úteis e retirar cobertura duplicada entre Node e Python.
- [x] Validar portal, Python e integração ETL; atualizar referências.

Removido `dataset.test.mjs`; testes úteis integrados em infraestrutura e matching.
Retirados comandos `enrich`/`catalog-id` e adaptadores sem consumidores de produção.
95 testes Node aprovados, um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. Fontes e dados operacionais preservados.

## Migração incremental HTML/Python — 2026-10-15

Base: `chore/project-cleanup` em `da8de67`; branch `refactor/html-python`.

- [x] Centralizar leitura, pesquisa e enriquecimento das fontes em Python.
- [x] Substituir estado e fetch do explorador por formulário HTML no servidor.
- [x] Mover a preparação das referências históricas para Python.
- [x] Migrar a composição TXT/Canva para Python mantendo regras de domínio partilhadas.
- [x] Validar APIs, erros, escaping, navegação sem JavaScript e idiomas.
- [x] Atualizar arquitetura e comandos, com commits separados por etapa.

Resultados: 101 testes do portal aprovados e um ignorado; 27 testes Python
aprovados; build aprovado. Consulta HTML em 360/1440 px, com e sem JavaScript;
12 cenários de navegação em seis idiomas; briefing em duas larguras; downloads
TXT em três larguras. 24 exportações TXT comparadas byte a byte com a versão
anterior. Exports de navegador num diretório temporário.

Preservar o editor interativo, os contratos das versões, PDFs e tradução.
Python usa a biblioteca padrão e não requer outro serviço nem instalação de
framework. Não converter componentes interativos para HTML estático quando isso
eliminar operações existentes ou exigir uma segunda implementação em JavaScript.

## Continuação HTML/Python — meteorologia

- [x] Migrar coordenadas, códigos WMO, previsão e fallback histórico para Python.
- [x] Manter o navegador como consumidor da API do portal, com cache e falhas explícitas.
- [x] Substituir a abertura/fecho do painel por popover HTML nativo.
- [x] Migrar os downloads do histórico para formulário HTML sem estado React.
- [x] Reutilizar a meteorologia Python na ferramenta do agente.
- [x] Validar fornecedor simulado, indisponibilidade, histórico, cache e navegação.
- [x] Atualizar arquitetura e evidência com commits separados.

96 testes Node aprovados e um ignorado; 37 Python aprovados; build aprovado.
Popover em 320/1440 px; downloads TXT e ZIP PDF em duas larguras, com e sem JS.
Meteorologia simulada e exports isolados num diretório temporário.

## Continuação HTML/Python — catálogo e histórico

- [x] Migrar a persistência do catálogo para SQLite Python, preservando o esquema.
- [x] Adaptar APIs e testes para operações assíncronas e validar conflitos.
- [x] Centralizar publicação e leitura do catálogo elegível em Python.
- [x] Converter a ação de Lixo no histórico para formulário HTML.
- [x] Validar bases temporárias, ETL, APIs e navegação sem JavaScript.
- [x] Atualizar documentação e CI com commits separados.

96 testes Node aprovados e um ignorado; 44 Python aprovados; build e integração
catálogo/ETL aprovados. 267 identificadores equivalentes. APIs reais com edição,
conflito e publicação em dados temporários; editor em seis idiomas; histórico
com e sem JavaScript em duas larguras.

## Simplificação para a próxima iteração do agente — 2026-10-15

Base: dev em `a4b7626`; branch `chore/project-cleanup`.
Âmbito: limpeza e consolidação, com commits separados por etapa.

- [x] Inventariar os 345 ficheiros versionados e analisar os imports do portal.
- [x] Remover artefactos locais, placeholders e experiências sem consumidores.
- [x] Consolidar documentação, prompt duplicado e módulo de tradução.
- [x] Atualizar exclusões, verificar referências e concluir a validação.

Validação: 99 testes do portal aprovados, um ignorado; build aprovado;
20 testes Python e cinco de tradução aprovados; Markdown e ligações locais
sem erros. O CI documental passa a verificar artefactos locais e links.

Todos os módulos TypeScript eram alcançáveis pelas entradas de produção.
Preservar as fronteiras funcionais e os contratos, em vez de juntar módulos
apenas para reduzir a contagem. Fontes Excel/PDF, catálogo, exports e warehouse
ficam preservados. A implementação da próxima iteração do agente está fora
desta entrega.

## Revisão integral do diretório — 2026-10-15

- [x] Inventariar recursivamente o diretório, sem seguir a montagem EFS.
- [x] Remover ficheiros órfãos, experiências não integradas e artefactos locais.
- [x] Retirar dependências experimentais e tornar os grupos ativos opcionais explícitos.
- [x] Regenerar dependências e validar instalação, Python, tradução, portal e CI.

Lockfile de 221 para 148 entradas; a instalação mínima usa nove pacotes e passa
18 testes do ETL. Ambiente completo: 21 testes Python, cinco de tradução e 99 do
portal aprovados, um ignorado; auditoria dos 147 pacotes sem avisos conhecidos.

Preservar as ferramentas do ambiente/IDE, fontes, propostas, backups, modelos
locais e a entrega warehouse usada pelo portal. A montagem EFS sai do Git mas
permanece disponível na instância.

## Fusão dos módulos auxiliares — 2026-10-15

- [x] Reunir caminhos e leitura de respostas em `http-client.ts`.
- [x] Reunir respostas e URLs públicas das APIs em `server-http.ts`.
- [x] Reunir input, textarea e estilo de select em `ui/form-controls.tsx`.
- [x] Validar imports, lint, tipos, testes, build e documentação.

Sete ficheiros passam a três, mantendo a separação cliente/servidor e os mesmos
exports públicos. Registar esta etapa num commit separado.

## Consolidação dos testes — 2026-10-15

- [x] Reunir navegação e responsividade em browser/ui.mjs, mantendo todos os cenários.
- [x] Reunir configuração, URLs públicas e compatibilidade em infrastructure.test.mjs.
- [x] Partilhar arranque do browser, leitura de fixtures e mock de tradução.
- [x] Comparar verificações, executar testes e atualizar os comandos e documentação.

As asserções e condições de falha originais foram comparadas automaticamente.
99 testes unitários aprovados e um ignorado; build aprovado; 42 cenários de
interface, stress, dois cenários de briefing e apresentação do itinerário
aprovados numa instância de produção com armazenamento temporário.

## Consola de desenvolvimento no SageMaker

- [x] Corrigir URLs da fonte e stack frames do overlay para respeitarem o prefixo.
- [x] Limitar a supressão de atributos de extensões à hidratação do body.
- [x] Validar check, build e navegador com prefixo e atributos Grammarly simulados.

100 testes aprovados e um ignorado; fonte e stack frames HTTP 200.

## Identificação e rótulos dos formulários

- [x] Associar os rótulos do briefing e identificar os campos sem id/name.
- [x] Usar fieldset/legend nos grupos de escolhas e nome acessível na pesquisa.
- [x] Verificar campos, rótulos e IDs no teste de navegador do briefing.

Check aprovado (100 testes e um ignorado), build aprovado e briefing validado
em 360 e 1440 px, incluindo edição, revisão e payload.

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
