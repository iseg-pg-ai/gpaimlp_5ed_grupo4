# BLU AI System — fundamentos, experiência e portal

Guião revisto em 19 de outubro de 2026, no branch `apresentacao-tecnica`.
Público de referência: avaliação académica e responsáveis da operação.

A apresentação passa a ter **três partes: explicar como o sistema foi construído,
mostrar como as peças criam valor e demonstrar o portal real**.

Estado atual: a [apresentação independente](../presentation/README.md) inclui
cinco cenas técnicas e as oito cenas narrativas anteriores. Há navegação entre
as partes e animações explicativas controláveis. O acesso ao portal abre um
novo separador; o portal e o dashboard analítico continuam separados.

## 1. Estrutura e mensagem central

**O sistema transforma conhecimento disperso numa proposta personalizada,
consultável, revista pelo curador e associada a uma versão identificável.**

```mermaid
flowchart LR
    A["I · Fundamentos técnicos"] --> B["II · Experiência de curadoria"]
    B --> C["III · Portal real"]
    A --- A1["Requisitos, arquitetura, tecnologias, processos e validação"]
    B --- B1["Caso fictício e decisões interativas"]
    C --- C1["Observatório e fluxo operacional demonstrados ao vivo"]
```

A parte I responde a **«Como e porquê foi construído desta forma?»**.
A parte II responde a **«O que significa isso para uma viagem concreta?»**.
A parte III responde a **«Como funciona na aplicação real?»**.

Proposta de duração, a ajustar ao tempo atribuído:

| Parte | Percurso principal | Versão curta |
| --- | --- | --- |
| I. Fundamentos técnicos | 7 minutos | 4 minutos |
| II. Experiência interativa | 6 minutos | 3 minutos |
| III. Portal real | 7 minutos | 5 minutos |
| Total, sem perguntas | 20 minutos | 12 minutos |

O tempo é uma proposta de guião, não um requisito já acordado. Os
aprofundamentos devem ficar acessíveis para perguntas, sem interromper o fio.

## 2. Parte I — os pontos técnicos a abordar

### 2.1. Problema, utilizadores e âmbito

Começar pela necessidade operacional e só depois apresentar a solução:
conhecimento em Excel, suplementos e PDFs; necessidade de o organizar,
consultar, rever e usar na preparação de propostas personalizadas.

Identificar o **curador** como utilizador principal do portal. Distinguir o
trabalho de quem mantém e aprova o catálogo da análise e da preparação da
proposta, sem sugerir que já existe gestão de papéis na aplicação.

Explicar o âmbito: o sistema prepara e entrega propostas; disponibilidade,
condições e reservas exigem processos próprios. Autenticação e colaboração
multiutilizador continuam a ser evolução a desenvolver.

**Visual sugerido:** fontes dispersas convergem num fluxo de curadoria.
**Mensagem oral:** «Definimos o que o sistema deve apoiar e onde continua a ser
necessária uma decisão humana.»

### 2.2. Requisitos funcionais e requisitos de qualidade

Mostrar requisitos ligados a comportamentos observáveis, com critérios de
aceitação que possam ser demonstrados.

| Tipo | Requisito a apresentar | Como o tornar verificável |
| --- | --- | --- |
| Funcional | Consultar e manter o catálogo | Abrir um registo, consultar origem e histórico de revisão |
| Funcional | Criar propostas adequadas ao briefing | Relacionar uma preferência ou exclusão com uma escolha no roteiro |
| Funcional | Respeitar restrições e atividades protegidas | Mostrar uma alteração válida e um pedido que não pode ser aplicado |
| Funcional | Guardar, reabrir e exportar versões | Relacionar o conteúdo revisto com a versão e o documento selecionados |
| Qualidade | Preservar rastreabilidade e contexto temporal | Distinguir fonte, evidência, data e informação histórica |
| Qualidade | Preservar integridade e concorrência | Demonstrar num cenário de teste a rejeição de uma revisão desatualizada |
| Qualidade | Tratar informação desconhecida explicitamente | Mostrar preço pendente sem o converter em zero, ou compatibilidade por confirmar |
| Qualidade | Manter legibilidade e interação responsiva | Verificar tamanhos de ecrã, teclado, foco e idiomas |
| Evolução | Autenticação, papéis e colaboração multiutilizador | Apresentar como trabalho futuro, com critérios ainda a definir |

Evitar requisitos vagos como «ser inteligente», «ser rápido» ou «ser seguro».
Se forem discutidos desempenho ou segurança, indicar métricas e controlos
concretos, o âmbito avaliado e o que falta medir ou implementar.

### 2.3. Arquitetura e fronteiras de responsabilidade

Mostrar primeiro os fluxos, depois identificar as tecnologias. Explicar a
separação entre fontes, catálogo operacional, entrega publicada e propostas.

```mermaid
flowchart TB
    F[Fontes Excel, suplementos e PDFs] --> E[ETL Python]
    C[Catálogo operacional SQLite] -->|Revisões aprovadas| E
    E --> W[Warehouse publicado]
    W --> P[Portal Next.js e domínio TypeScript]
    W --> O[Observatório nativo e Streamlit]
    P -->|Edição validada| C
    P <--> PY[Operações locais Python via JSON]
    P <--> R[Rascunhos no navegador]
    P --> V[Versões, snapshots e PDFs persistidos]
    P <-.-> AG[Serviço de agente opcional]
    AG --> M[Modelo de linguagem e ferramentas]
```

O diagrama é funcional: não representa todos os pedidos nem um deployment
completo. As operações locais Python e o serviço HTTP do agente têm fronteiras
distintas. O adaptador local usa processos sem shell e mensagens JSON; não exige
um segundo servidor para essas operações.

Quatro distinções essenciais:

- **Catálogo operacional:** edição, revisões e aprovações.
- **Warehouse:** entrega publicada e validada, consumida pela análise e portal.
- **Rascunhos:** estado de trabalho no navegador.
- **Versões:** snapshots e documentos históricos persistidos no servidor.

Uma alteração no catálogo não reescreve uma proposta já guardada. O portal não
edita diretamente o warehouse. Estas fronteiras explicam boa parte do desenho.

### 2.4. Tecnologias e justificação das escolhas

Apresentar cada tecnologia através da responsabilidade que tem no código.
A justificação abaixo é uma forma de explicar o desenho atual; não substitui
um levantamento de alternativas ou um benchmark, que não foi realizado aqui.

| Camada | Tecnologias declaradas no projeto | Papel e justificação a desenvolver |
| --- | --- | --- |
| Portal | Next.js, React, TypeScript, Tailwind CSS | Interface interativa, rotas de servidor e contratos do domínio |
| Ingestão e transformação | Python, pandas, openpyxl, pypdf | Leitura de folhas e documentos, transformação e validação das fontes |
| Dados | SQLite, JSONL e ficheiros versionados | Persistência local e entregas consultáveis; explicitar os limites para evolução colaborativa |
| Análise | Streamlit e Plotly; Observatório nativo em React/SVG | Exploração da entrega publicada com interfaces distintas |
| Agente opcional | FastAPI, LangChain/LangGraph, boto3 e AWS Bedrock | Serviço de assistência, modelo de linguagem e ferramentas de domínio |
| Tradução opcional | Argos Translate e CTranslate2 | Tradução local de conteúdos exportados, com proteção de números |
| Entregas | PDFKit e composição TXT/Canva | Produção de documentos e orientação de uma composição visual independente |
| Verificação | unittest, node:test e Playwright | Testes de regras, persistência, integração e interface |
| Apresentação independente | HTML, CSS, JavaScript e servidor Python padrão | Narrativa demonstrativa na porta 3003, sem dependências de execução do portal |

Confirmar versões nos manifests antes da sessão: Python 3.12/3.13 e Node
22.13 a 24.x são os intervalos definidos neste checkout. Os manifests e os
lockfiles prevalecem sobre este resumo.

Distinguir também **onde corre** de **como foi construído**: o ambiente atual
usa SageMaker Studio Code Editor para execução e acesso. Isto não significa
que foi treinado um modelo próprio no SageMaker, nem que existe autenticação
interna do portal. O acesso do Studio e os papéis da aplicação são temas distintos.

### 2.5. Dados, modelos e processos de ponta a ponta

Seguir um registo ao longo do processo, em vez de mostrar uma lista de scripts.

```mermaid
flowchart LR
    F[Fonte preservada] --> I[Ingestão e identificação]
    I --> N[Normalização e validação]
    C[Edição e aprovação no catálogo] --> N
    N --> T[Preparar entrega temporária]
    T --> Q{Validação da entrega}
    Q -->|Sucesso| W[Publicação do warehouse]
    Q -->|Falha| A[Conservar ou repor entrega anterior]
    W --> P[Oferta elegível para curadoria]
    P --> R[Revisão da proposta]
    R --> V[Versão guardada e exportação]
```

Abordar estes aspetos com um exemplo por tema:

- **Identidade e relações:** IDs e chaves explícitas ligam registos e histórico;
  uma semelhança de nomes não prova uma correspondência.
- **Qualidade:** campos em falta, conflitos e evidência têm tratamento explícito.
- **Normalização:** destinos e unidades são harmonizados sem apagar as condições
  e o valor original. Informação desconhecida continua desconhecida.
- **Validade temporal:** um preço histórico ou expirado não passa a preço atual.
- **Publicação:** o ETL valida antes da troca e tem recuperação da entrega anterior.
- **Revisões:** aprovar, publicar e guardar uma proposta são operações distintas.
- **Custos:** separar valores conhecidos, pendências e totais por moeda.

Uma evolução para S3 ou persistência cloud deve aparecer como evolução,
sem representar um adaptador ainda não implementado como operacional.

### 2.6. Papel da IA, ferramentas e controlo humano

Esta é uma distinção técnica central, sobretudo perante uma avaliação de IA.

| Mecanismo | O que faz | O que não se deve inferir |
| --- | --- | --- |
| Regras e comandos determinísticos | Elegibilidade, critérios de curadoria e alterações suportadas | Uma resposta no chat não prova que um LLM foi chamado |
| Agente de linguagem opcional | Usa modelo e ferramentas de pesquisa do catálogo, meteorologia e restrições | A existência do código não comprova disponibilidade ou execução do fornecedor |
| Modelos locais de tradução | Traduzem conteúdos exportados quando preparados | Tradução não confirma os factos ou condições comerciais |
| Revisão humana | Resolve pendências, revê a proposta e prepara a entrega | Uma proposta gerada não equivale a uma reserva confirmada |

```mermaid
flowchart LR
    U[Pedido do curador] --> D{Mecanismo aplicável}
    D --> R[Comando e regras determinísticas]
    D -.-> A[Agente opcional com modelo e ferramentas]
    R --> C[Verificar efeitos e limites do fluxo]
    A --> H[Rever resposta e evidência]
    C --> H
    H --> V[Aplicar e guardar através do fluxo validado]
```

O esquema mostra a separação de responsabilidades a explicar; não afirma que
qualquer resposta livre do agente seja convertida automaticamente numa ação.
Mostrar a chamada e o comportamento concretos do fluxo escolhido.

Explicar a consulta ao catálogo conhecido e as ferramentas realmente presentes.
Não apresentar fine-tuning, pesquisa vetorial, RAG com embeddings ou treino
próprio como funcionalidades implementadas sem evidência no código.

A demonstração atual tem respostas preparadas e assinaladas como simulação.
Para uma chamada real, confirmar serviço, modelo configurado e autorização de
custos antes da sessão. Conteúdos de PDFs, clientes e respostas externas são
dados; não devem ser tratados como instruções do sistema.

### 2.7. Validação, evidência e limitações

Mostrar **o que os testes protegem**, com exemplos concretos:

| Fronteira | Comportamento a verificar | Referência no repositório |
| --- | --- | --- |
| Publicação ETL | Falha de construção conserva a entrega; falha na troca repõe a anterior | [test_local_source.py](../tests/test_local_source.py) |
| Catálogo e publicação | Revisões e estado publicado condicionam a oferta elegível | [catalog.test.mjs](../dmc-workspace/tests/catalog.test.mjs) |
| Versões | Escritas desatualizadas são rejeitadas; snapshots e bytes históricos são preservados | [versions.test.mjs](../dmc-workspace/tests/versions.test.mjs) |
| Informação desconhecida | Ausências e zero não são confundidos na análise | [test_portal_observatory.py](../tests/test_portal_observatory.py) |
| Interface | Navegação, foco, dimensões e texto ampliado | [ui.mjs](../dmc-workspace/tests/browser/ui.mjs) |
| Tradução | Números protegidos, falhas e modelos ausentes | [test_worker.py](../translations/test_worker.py) |

Distinguir resultados de testes unitários, integração com dados temporários,
interface com APIs simuladas e serviços externos reais. Uma bateria aprovada
não prova, por si só, adequação comercial ou prontidão para produção.

Se forem usados números, apresentar data, ambiente e âmbito da execução. Os
registos locais anteriores estão no [plano](../PLAN.md) e em
[testes e histórico](TESTING.md); esta revisão documental não executou de novo
a bateria completa do sistema.

Fechar com os limites atuais: autenticação e papéis, sincronização
multiutilizador, persistência cloud e revisão do acesso externo. Ganhos de
rapidez, consistência e qualidade devem ser avaliados com curadores; não
atribuir percentagens sem medições.

### 2.8. Como condensar estes pontos em cinco cenas técnicas

| Cena | Tempo sugerido | Conteúdo | Interação visual proposta |
| --- | --- | --- | --- |
| T1. O problema e os requisitos | 1 min 30 s | Utilizadores, âmbito e critérios de aceitação | Selecionar um requisito e ver o comportamento que exige |
| T2. Arquitetura e tecnologias | 2 min | Responsabilidades, camadas e escolhas | Abrir um componente e revelar tecnologia, papel e fronteira |
| T3. O percurso de um dado | 1 min 30 s | Ingestão, validação, aprovação, publicação e versões | Seguir um registo; ilustrar uma falha sem executar o ETL |
| T4. O papel da IA | 1 min | Regras, agente, ferramentas, tradução e revisão | Comparar os mecanismos para o mesmo tipo de necessidade |
| T5. Evidência e limites | 1 min | Testes relevantes, serviços opcionais e evolução | Selecionar uma falha e explicar o contrato protegido |

**Total: 7 minutos.** As cinco cenas estão implementadas na abertura técnica,
sem chamadas a modelos, publicação de dados ou execução implícita de testes.
As ligações da arquitetura têm movimento direcional; um registo percorre as
etapas; o apresentador pode ilustrar uma falha de publicação e observar a
entrega anterior preservada. Os realces de mecanismos e contratos explicam
as mudanças. O botão Pausar animações e a preferência de movimento reduzido
desativam os efeitos sem ocultar conteúdo ou impedir a interação.

Frase de passagem para a parte II:

> Já vimos os contratos e as peças. Vamos agora acompanhar uma viagem e perceber
> como essas decisões de engenharia aparecem na experiência do curador.

## 3. Parte II — transição entre engenharia e experiência

Reutilizar a apresentação interativa existente. O público acompanha um caso
fictício e vê os efeitos das escolhas, sem precisar de voltar a ouvir a descrição
de cada tecnologia.

Percurso guiado sugerido, usando os capítulos já disponíveis:

| Cena existente | Papel na transição |
| --- | --- |
| O pedido | Dar rosto aos requisitos através de dois adultos e dois dias em Lisboa |
| O território | Explorar possibilidades e contexto num mapa esquemático |
| A proposta | Relacionar o interesse escolhido com o roteiro e ajustar uma tarde livre |
| A colaboração | Mostrar uma alteração permitida e o limite de uma atividade protegida |
| A entrega | Comparar exemplos de versões e ligar revisão à entrega |
| O próximo passo | Encerrar a simulação e abrir o Observatório real |

Os capítulos **Os dados** e **Por dentro** continuam úteis para exploração e
perguntas, mas podem ser saltados no percurso guiado para evitar repetir a parte I.
Não é necessário apagar essas cenas da aplicação existente.

Caso comum: Grupo Demonstração BLU, dois adultos, dois dias em Lisboa, ritmo
tranquilo, cultura ou gastronomia e exclusão de atividades de barco. O exemplo
deve manter-se consistente nas três partes. Necessidades de mobilidade exigem
verificação explícita; se faltar informação, mostrar a pendência.

O mapa, as ofertas, as respostas e a pré-visualização de versões nesta
apresentação são ilustrativos. Não são leituras em direto do catálogo, geração
por IA, versões persistidas ou PDFs exportados.

Frase de passagem para a parte III:

> Esta experiência mostrou o percurso com um exemplo preparado. Vamos agora
> abrir a aplicação e consultar a informação real que suporta o trabalho.

## 4. Parte III — demonstração do portal real

O ecrã final mantém o botão **Explorar o Observatório real**, que abre um
novo separador com o endereço indicado pelo utilizador:

[Explorar o Observatório real](https://ai5qwwdt6siuxug.studio.eu-west-1.sagemaker.aws/codeeditor/default/ports/3001/catalog)

O acesso depende da sessão SageMaker do visitante. O endereço não é um link
público para clientes externos. Renovar o acesso antes da apresentação e manter
a apresentação aberta para poder regressar ao guião.

Demonstração sugerida, com um caso previamente preparado:

1. **Observatório:** filtrar um destino, abrir a ficha e mostrar contexto,
   qualidade ou uma pendência. Os indicadores pertencem à entrega consultada;
   registar a data se forem usados em capturas.
2. **Workspace:** relacionar os campos do briefing com uma proposta de demonstração
   e explicar uma escolha, exclusão ou informação por confirmar.
3. **Revisão:** mostrar uma edição suportada ou uma atividade protegida,
   distinguindo comandos determinísticos de eventuais chamadas ao agente.
4. **Entrega:** abrir uma versão de demonstração e o seu PDF, mostrando a ligação
   entre snapshot e documento. Explicar TXT/Canva como composição independente.

O Observatório nativo tem Panorama, Explorar oferta, Destinos, Preços, Histórico
e Qualidade; escolher apenas as vistas relevantes para a história. A aplicação
Streamlit original continua separada. A interface do portal tem seis idiomas;
a tradução de conteúdos exportados depende dos modelos locais preparados.

Usar dados fictícios e armazenamento de demonstração para os fluxos com escrita.
Preparar o cenário antes da sessão para não alterar catálogo, aprovações ou
propostas de clientes durante uma demonstração improvisada. O sistema produz
propostas, não efetua reservas nem confirma automaticamente condições comerciais.

## 5. Linguagem visual e navegação

Manter a identidade da mesa de curadoria: azul-petróleo, tipografia editorial,
apontamentos dourados e transições com significado. Cada cena deve ter uma
pergunta, uma prova visual e uma conclusão curta.

```text
┌────────────────────────────────────────────────────────────────────┐
│ blu.      I · Fundamentos     II · Experiência     III · Portal ↗   │
├────────────────────────────────────────────────────────────────────┤
│ Capítulos da parte selecionada                                     │
│                                                                    │
│ Uma pergunta                  Um diagrama ou interação              │
│ Uma mensagem principal        Responsabilidade / estado / evidência │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ Parte I · 2/5              [Anterior] [Seguinte / Entrar na parte II]│
└────────────────────────────────────────────────────────────────────┘
```

A navegação de três partes está implementada neste branch. A terceira parte
abre o portal, sem o incorporar num iframe nem alterar os seus serviços.

Dar acesso direto às partes para perguntas e para uma apresentação mais curta.
O avanço é manual; manter teclado, foco visível e alternativa sem movimento.
Evitar código extenso no ecrã: usar um excerto curto apenas quando fundamenta
uma decisão importante. Referências detalhadas ficam disponíveis no guião.

## 6. Perguntas a preparar

| Pergunta | Ponto de resposta |
| --- | --- |
| Porque separam catálogo e warehouse? | Revisão operacional e entrega publicada têm responsabilidades e ciclos próprios |
| Porque usam Python e TypeScript? | Explicar os papéis que têm no código e a fronteira JSON, sem alegar um benchmark inexistente |
| O que acontece se a publicação falhar? | Preparação temporária, validação e conservação ou recuperação da entrega anterior |
| Onde está a IA? | Distinguir agente opcional, comandos determinísticos e tradução local |
| Como avaliam respostas ou propostas? | Testes de contratos e uma avaliação com curadores a definir; distinguir qualidade técnica de comercial |
| Como evitam factos inventados? | Catálogo conhecido, fontes, validações, pendências e revisão humana; não prometer ausência total de erros |
| Como resolvem alterações concorrentes? | Revisões e conflitos; isso não equivale a sincronização colaborativa completa |
| O que falta para produção? | Identidade, papéis, persistência e operação cloud, acesso externo e avaliação no contexto de uso |

## 7. Preparação e próximos passos

- Ensaiar as cinco cenas técnicas e a navegação das três partes já implementadas
  na aplicação independente, mantendo os serviços do portal inalterados.
- Ensaiar o percurso e a duração com alguém que não conhece o sistema.
- Confirmar versões, fontes e evidência antes de mostrar números ou resultados.
- Preparar a sessão SageMaker, o caso fictício e uma versão de apoio para o portal.
- Identificar claramente simulações, capturas datadas e demonstrações reais.
- Confirmar serviços opcionais e autorização antes de qualquer chamada com custos.
- Preparar capturas ou gravação de apoio, sem apresentar uma gravação como execução
  ao vivo se uma dependência falhar.

## Fontes internas

- [Arquitetura e contratos](ARCHITECTURE.md)
- [Portal e fluxos de entrega](PORTAL.md)
- [Pipeline e publicação](DATA_PIPELINE.md)
- [Testes e histórico](TESTING.md)
- [Decisões](DECISIONS.md)
- [Plano e registos de validação](../PLAN.md)
- [Dependências Python](../pyproject.toml)
- [Dependências e comandos do portal](../dmc-workspace/package.json)
- [Adaptador local Python](../dmc-workspace/src/lib/python-portal.ts)
- [Catálogo operacional](../etl/portal_catalog.py)
- [Comandos determinísticos](../dmc-workspace/src/lib/assistant-editing.ts)
- [Agente e ferramentas](../src/blu_ai/agents/curator_agent.py)
