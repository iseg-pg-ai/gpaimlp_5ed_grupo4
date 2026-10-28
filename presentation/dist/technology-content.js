// Define o conteúdo técnico da apresentação para reutilização pelas cenas da demonstração.
/* Inventário editorial baseado nos manifests e código; não consulta serviços nem configuração privada. */
window.BluTechnologyContent = [
  {
    label: "Portal e integração",
    category: "INTERFACE / SERVIDOR",
    title: "React no navegador. Node e Python no servidor.",
    technologies:
      "Next.js ^16.4.0 · React 19.2.8 · TypeScript ^5 · Tailwind CSS ^4",
    role: "React suporta o briefing, edição e estado interativo. As rotas Next.js validam pedidos; a lógica de curadoria continua em TypeScript.",
    example:
      "Uma consulta ao catálogo chega à rota do portal, que pode invocar uma operação Python local e devolver o resultado ao navegador.",
    details: [
      [
        "Fronteira Node/Python",
        "execFile inicia python -m portal.data sem shell. Parâmetros em JSON por stdin; resposta JSON por stdout. Não é um servidor HTTP adicional.",
      ],
      [
        "Limites do adaptador",
        "Timeout de 15 s e buffer máximo de 16 MiB. Erros de execução e respostas inválidas são convertidos em erros do portal.",
      ],
      [
        "Estado e renderização",
        "Rascunhos e preferências vivem no navegador; APIs e persistência autoritativa ficam no servidor. O explorador de fontes usa formulários GET e HTML servido pelo servidor.",
      ],
      [
        "Ambiente",
        "Node >=22.13 e <25. package.json declara dependências; package-lock.json fixa a resolução. Estes valores são declarações do projeto, não uma medição do ambiente em produção.",
      ],
    ],
    source:
      "dmc-workspace/package.json · dmc-workspace/src/lib/python-portal.ts · portal/data.py",
  },
  {
    label: "Ingestão e dados",
    category: "PYTHON / TRANSFORMAÇÃO",
    title: "Cada formato tem uma responsabilidade.",
    technologies:
      "Python >=3.12,<3.14 · pandas 2.3.3 · openpyxl 3.1.5 · pypdf 6.19.0",
    role: "openpyxl e pandas apoiam a leitura e transformação das folhas. pypdf extrai texto e preserva referências de documentos e páginas.",
    example:
      "Um suplemento complementa o catálogo por chave explícita, sem substituir silenciosamente valores já presentes. Divergências ficam auditadas.",
    details: [
      [
        "Modelo dos dados",
        "Oferta, preços, referências históricas e evidência por campo têm papéis distintos. IDs relacionam entidades; destinos e unidades são harmonizados conservando o original.",
      ],
      [
        "Entrega",
        "SQLite para consulta relacional; JSONL por entidade; manifest com hashes SHA-256, papéis e contagens; relatórios de validação e problemas de qualidade.",
      ],
      [
        "Publicação",
        "Construção numa pasta temporária, validação e substituição da entrega. A recuperação conserva ou repõe a entrega anterior, consoante a falha.",
      ],
      [
        "Contrato temporal",
        "Confirmação, fonte, data e validade não são equivalentes. Histórico ou ausência de evidência não confirmam um preço ou uma condição atual.",
      ],
    ],
    source:
      "pyproject.toml · etl/sources.py · etl/structured.py · etl/observatory.py · etl/pipeline.py",
  },
  {
    label: "Persistência e entregas",
    category: "SQLITE / DOCUMENTOS",
    title: "Quatro estados, quatro lugares.",
    technologies:
      "SQLite · localStorage · SHA-256 · PDFKit ^0.20.2 · Prompt TXT",
    role: "O catálogo operacional guarda revisões. O warehouse publica uma entrega. Rascunhos pertencem ao navegador. Versões e PDFs pertencem ao armazenamento do servidor.",
    example:
      "O pedido de gravação transporta baseVersion. Se a base estiver desatualizada, o servidor rejeita a escrita em vez de sobrescrever a versão atual.",
    details: [
      [
        "Concorrência",
        "O catálogo usa transações SQLite BEGIN IMMEDIATE. O histórico de propostas verifica a versão de base e mantém a relação com a versão anterior.",
      ],
      [
        "Integridade",
        "Snapshot serializado, snapshotHash, chainHash e parentVersion identificam a evolução. PDFs persistidos têm bytes e hashes preservados.",
      ],
      [
        "Saídas",
        "PDFKit compõe o PDF DMC; ZIP reúne documentos. O Prompt TXT parte do snapshot guardado, exclui contactos e notas internas e é independente de fornecedor.",
      ],
      [
        "Fronteira operacional",
        "Dados operacionais e exports ficam fora do Git e precisam de backup. SQLite local e conflitos de revisão não equivalem a colaboração multiutilizador completa.",
      ],
    ],
    source:
      "etl/portal_catalog.py · dmc-workspace/src/lib/version-store.ts · portal/prompt.py",
  },
  {
    label: "Agente e ferramentas",
    category: "SERVIÇO OPCIONAL / IA",
    title: "O modelo é configurável. As ferramentas são explícitas.",
    technologies:
      "FastAPI · Uvicorn · LangChain/LangGraph · boto3 · AWS Bedrock",
    role: "FastAPI expõe o serviço. LangGraph orquestra o agente com ferramentas de pesquisa do catálogo, meteorologia e verificação de restrições. boto3 e a integração Bedrock ligam ao fornecedor.",
    example:
      "Um pedido ao agente pode originar uma consulta por ferramenta. Isto não demonstra que uma resposta livre seja convertida automaticamente numa alteração guardada.",
    details: [
      [
        "Modelo e região",
        "BEDROCK_MODEL_ID e AWS_REGION são configuráveis. A identificação e região efetivamente usadas na demonstração precisam de confirmação; não são inferidas desta lista de dependências.",
      ],
      [
        "Parâmetros declarados",
        "O código define por defeito temperatura 0,2 e limite de 4096 tokens; AGENT_TEMPERATURE e AGENT_MAX_TOKENS podem alterá-los. São defaults, não resultados de otimização.",
      ],
      [
        "Autenticação e disponibilidade",
        "O caminho Bedrock usa credenciais/papel IAM do ambiente. Disponibilidade, permissões, custos e respostas reais exigem validação própria.",
      ],
      [
        "O que falta documentar com a equipa",
        "Modelo efetivamente escolhido, razão da escolha, exemplos avaliados, critérios de qualidade e custos/latência medidos. A apresentação não preenche estes dados com suposições.",
      ],
    ],
    source:
      "src/blu_ai/api/server.py · src/blu_ai/agents/curator_agent.py · src/blu_ai/llm.py · src/blu_ai/config.py",
  },
  {
    label: "Análise e tradução",
    category: "LEITURA / MODELOS LOCAIS",
    title: "Explorar e traduzir são fluxos diferentes.",
    technologies:
      "Streamlit 1.55.0 · Plotly 6.5.2 · React/SVG · Argos Translate 1.11.0 · CTranslate2",
    role: "Streamlit/Plotly suportam a análise original. O Observatório nativo usa React e SVG com leitura do warehouse. A tradução usa modelos locais preparados separadamente.",
    example:
      "A rota /api/observatory recebe um snapshot de leitura Python. A tradução comunica com um worker JSON-lines e verifica a preservação de conteúdo numérico.",
    details: [
      [
        "Observatório",
        "Ligação SQLite em modo read-only e uma transação de leitura. A análise do portal não depende de embutir ou alterar o dashboard Streamlit.",
      ],
      [
        "Tradução",
        "Argos Translate e CTranslate2 usam modelos locais. Instalação dos modelos e execução da tradução são etapas distintas; runtime não descarrega automaticamente um modelo em falta.",
      ],
      [
        "Apresentação atual",
        "Esta apresentação é HTML/CSS/JavaScript independente, servida por Python padrão. Os mapas e respostas demonstrativos não consultam o catálogo nem um modelo.",
      ],
      [
        "Grupos opcionais",
        "dashboard, agent e translation são grupos explícitos no pyproject.toml. A instalação base prepara o ETL, não todas as capacidades opcionais.",
      ],
    ],
    source:
      "pyproject.toml · portal/observatory.py · dashboard/app.py · translations/worker.py",
  },
  {
    label: "Serviços externos",
    category: "ROTAS / METEOROLOGIA",
    title: "Uma dependência externa precisa de um limite.",
    technologies: "Open-Meteo · OSRM · APIs locais do portal",
    role: "A meteorologia é centralizada em Python e reutilizada pelo portal e agente. O módulo de rotas pode consultar OSRM e distingue estimativas de percursos obtidos.",
    example:
      "Sem resposta meteorológica, o portal assinala indisponibilidade. Não substitui a falha por temperaturas fixas nem por condições favoráveis inventadas.",
    details: [
      [
        "Meteorologia",
        "Previsão e histórico usam endpoints distintos. O código limita o timeout a 4 s; a cache de respostas disponíveis dura 30 minutos. Indisponibilidade não é guardada em cache.",
      ],
      [
        "Percursos",
        "O endereço do router pode ser configurado por OSRM_ROUTER_URL. Pedidos têm timeout/aborto e tratamento de falhas; as alternativas continuam a exigir revisão.",
      ],
      [
        "Limite comercial",
        "Previsão, histórico e estimativa de deslocação não confirmam reservas, preços ou condições do fornecedor.",
      ],
      [
        "Informação a complementar",
        "Acordos de serviço, limites de utilização, política de custos e critérios de escolha dos fornecedores não foram estabelecidos por esta revisão do código.",
      ],
    ],
    source:
      "portal/weather.py · dmc-workspace/src/lib/road-routing.ts · docs/ARCHITECTURE.md",
  },
  {
    label: "Ambiente e automação",
    category: "REPRODUTIBILIDADE / CI",
    title: "Executar, verificar e publicar não são a mesma operação.",
    technologies:
      "uv / uv.lock · npm / package-lock.json · GitHub Actions · unittest · node:test · Playwright",
    role: "Lockfiles e manifests definem o ambiente. Os workflows existentes cobrem dados e documentação. O portal tem comandos próprios de qualidade, build e testes de navegador.",
    example:
      "A pipeline CI de dados executa ETL, verifica o validation gate, corre regressões selecionadas e disponibiliza a entrega como artefacto.",
    details: [
      [
        "Automação existente",
        "Há workflows de dados e documentação neste checkout. A pipeline de dados usa Windows/Python 3.13 e é acionada por alterações nos caminhos definidos ou manualmente.",
      ],
      [
        "Portal",
        "npm run check agrega lint, tipos, formatação e testes Node; npm run build produz a aplicação. Os testes de navegador exigem o serviço iniciado. Não existe um workflow CI do portal neste checkout.",
      ],
      [
        "Acesso atual",
        "SageMaker Studio Code Editor aloja a execução e o acesso por proxy. Isso não equivale a autenticação interna, persistência cloud ou um deployment de produção completo.",
      ],
      [
        "A completar com a equipa",
        "Estratégia de branches, responsabilidades, decisões históricas, alternativas comparadas e critérios de aceitação dos utilizadores. O Git guarda evidência de alterações, não a intenção completa da equipa.",
      ],
    ],
    source:
      "pyproject.toml · uv.lock · dmc-workspace/package.json · .github/workflows/data-pipeline.yml · .github/workflows/documentation.yml",
  },
];
