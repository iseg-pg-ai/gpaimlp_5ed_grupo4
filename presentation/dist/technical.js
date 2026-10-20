/* Ato técnico ilustrativo. Não executa ETL, modelos, testes ou operações do portal. */
window.BluTechnical = (() => {
  const initial = {
    requirement: 0,
    node: 0,
    stack: 0,
    phase: 0,
    failed: false,
    mechanism: 0,
    proof: 0,
  };
  const state = { ...initial };
  let observer;
  const $ = (selector) => document.querySelector(selector);
  const mark =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg>';
  const source = (text) =>
    `<p class="tech-source">REFERÊNCIA NO PROJETO <code>${text}</code></p>`;
  const requirements = [
    {
      label: "Personalização",
      code: "RF / 01",
      title: "Um pedido com critérios.",
      task: "Dois dias em Lisboa, sem atividades de barco.",
      rule: "Preferências orientam as escolhas. Restrições e exclusões condicionam a elegibilidade.",
      effect:
        "A proposta tem de respeitar o briefing e tornar visíveis as lacunas.",
      source:
        "dmc-workspace/src/lib/curation.ts · dmc-workspace/tests/catalog-matching.test.mjs",
    },
    {
      label: "Rastreabilidade",
      code: "RQ / 02",
      title: "Uma escolha com origem.",
      task: "De onde vem esta informação? E de quando é?",
      rule: "Conservar identificadores, fontes, relações e contexto temporal.",
      effect:
        "Uma referência histórica não se torna automaticamente uma tarifa atual.",
      source: "etl/observatory.py · portal/observatory.py",
    },
    {
      label: "Integridade",
      code: "RQ / 03",
      title: "O passado não se reescreve.",
      task: "Dois pedidos tentam guardar sobre a mesma revisão.",
      rule: "Verificar a versão de base e preservar snapshots, hashes e bytes PDF.",
      effect:
        "Uma escrita desatualizada é rejeitada; o histórico continua identificável.",
      source:
        "dmc-workspace/src/lib/version-store.ts · dmc-workspace/tests/versions.test.mjs",
    },
    {
      label: "Continuidade",
      code: "RQ / 04",
      title: "Uma falha precisa de uma resposta explícita.",
      task: "O fornecedor de meteorologia não responde.",
      rule: "Distinguir indisponibilidade de informação confirmada e manter as pendências visíveis.",
      effect:
        "O curador vê o que precisa de verificar; a aplicação não inventa temperaturas para preencher a falha.",
      source: "portal/weather.py · tests/test_weather.py",
    },
  ];
  function requirementDetail() {
    const item = requirements[state.requirement];
    return `<span class="show-eyebrow">${item.code} / DO PEDIDO AO CONTRATO</span><h2>${item.title}</h2><p class="tech-quote">«${item.task}»</p><div class="tech-contract"><span>REQUISITO</span><p>${item.rule}</p><i aria-hidden="true">↓</i><span>COMPORTAMENTO OBSERVÁVEL</span><strong>${item.effect}</strong></div>${source(item.source)}`;
  }
  function requirementsScene() {
    return `<div class="tech-requirement-list"><div class="tech-part-heading"><span>I</span><p>Construir o sistema<br><strong>começa por definir o contrato.</strong></p></div><div role="group" aria-label="Requisitos do sistema">${requirements.map((item, i) => `<button type="button" data-tech-requirement="${i}" aria-pressed="${state.requirement === i}"><span>0${i + 1}</span><strong>${item.label}</strong><small>${item.code}</small><i aria-hidden="true">→</i></button>`).join("")}</div><p class="show-context">Funcionalidade, qualidade e âmbito têm critérios distintos. Selecione um para explorar.</p></div><div id="tech-requirement-detail" class="tech-detail" aria-live="polite" aria-atomic="true">${requirementDetail()}</div>`;
  }
  const nodes = [
    {
      title: "Fontes e catálogo",
      text: "As fontes são preservadas. O catálogo operacional guarda edição, revisões e aprovações; não é o warehouse.",
      boundary: "data/ → catálogo operacional",
      source: "etl/sources.py · etl/portal_catalog.py",
    },
    {
      title: "Ingestão e ETL",
      text: "Ler, harmonizar, validar e preparar uma entrega. A troca só acontece após a validação; a falha tem recuperação.",
      boundary: "Fontes → entrega temporária → publicação",
      source: "etl/pipeline.py · tests/test_local_source.py",
    },
    {
      title: "Entrega publicada",
      text: "O warehouse é uma entrega gerada, consultada pelo portal, pelo Observatório nativo e pela aplicação Streamlit.",
      boundary: "Leitura da entrega; sem edição manual",
      source: "warehouse/ · portal/observatory.py",
    },
    {
      title: "Portal e domínio",
      text: "Interface, APIs e regras de domínio. Operações Python locais usam JSON e processos sem shell; não exigem o serviço do agente.",
      boundary: "Navegador ↔ servidor Node ↔ operações locais Python",
      source:
        "dmc-workspace/src/lib/python-portal.ts · dmc-workspace/src/app/api/",
    },
    {
      title: "Agente opcional",
      text: "O serviço de assistência pode consultar ferramentas e um modelo. A existência do código não comprova que um fornecedor esteja disponível.",
      boundary: "Serviço separado; o portal funciona sem ele",
      source: "src/blu_ai/agents/curator_agent.py",
    },
    {
      title: "Versões e entregas",
      text: "O servidor preserva versões e documentos. Os rascunhos continuam no navegador. A tradução local usa Argos Translate/CTranslate2 quando preparada.",
      boundary: "Rascunho → revisão → versão → exportação",
      source: "dmc-workspace/src/lib/version-store.ts · translations/worker.py",
    },
  ];
  function nodeDetail() {
    const node = nodes[state.node];
    return `<span class="show-eyebrow">CAMADA 0${state.node + 1} / RESPONSABILIDADE</span><h2>${node.title}</h2><p>${node.text}</p><div class="tech-boundary">${mark}<span>${node.boundary}</span></div>${source(node.source)}`;
  }
  function architectureScene() {
    return `<div class="tech-architecture"><svg class="tech-wires" aria-hidden="true"></svg><div class="tech-node-grid" role="group" aria-label="Camadas e tecnologias">${nodes.map((node, i) => `<button type="button" data-tech-node="${i}" aria-pressed="${state.node === i}" class="${i === 4 ? "tech-optional" : ""}"><span>0${i + 1}</span><strong>${node.title}</strong></button>`).join("")}</div><p class="show-context">Ligações de responsabilidade ilustradas. Não representam tráfego de rede ou serviços em execução.</p></div><div id="tech-node-detail" class="tech-detail" aria-live="polite" aria-atomic="true">${nodeDetail()}</div>`;
  }
  const escapeText = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const technologies = window.BluTechnologyContent;
  function stackDetail() {
    const item = technologies[state.stack];
    return `<span class="show-eyebrow">${escapeText(item.category)}</span><h2>${escapeText(item.title)}</h2><p class="tech-stack-label">${escapeText(item.technologies)}</p><p>${escapeText(item.role)}</p><div class="tech-stack-example"><span>EXEMPLO CONCRETO</span><p>${escapeText(item.example)}</p></div><details class="tech-deep-dive"><summary>Explorar implementação e limites</summary><dl>${item.details.map(([key, value]) => `<div><dt>${escapeText(key)}</dt><dd>${escapeText(value)}</dd></div>`).join("")}</dl></details>${source(escapeText(item.source))}`;
  }
  function technologiesScene() {
    return `<div class="tech-stack-list"><span class="show-eyebrow">DEPENDÊNCIAS DECLARADAS NO PROJETO</span><div role="group" aria-label="Áreas de implementação">${technologies.map((item, index) => `<button type="button" data-tech-stack="${index}" aria-controls="tech-stack-detail" aria-pressed="${state.stack === index}"><span>0${index + 1}</span><strong>${escapeText(item.label)}</strong><i aria-hidden="true">→</i></button>`).join("")}</div><p class="show-context">Versões e limites lidos dos manifests e do código. Não é um inventário de serviços em execução nem uma comparação medida entre alternativas.</p></div><div id="tech-stack-detail" class="tech-detail" aria-live="polite" aria-atomic="true">${stackDetail()}</div>`;
  }
  const phases = [
    {
      label: "Fonte",
      title: "Um registo, uma origem.",
      text: "O exemplo AT-DEMO-01 começa numa fonte fictícia. Identidade e contexto acompanham-no ao longo do fluxo.",
      status: "FONTE PRESERVADA",
    },
    {
      label: "Validar",
      title: "Organizar sem inventar.",
      text: "Normalizar campos, verificar relações e assinalar ausências. Um preço desconhecido continua pendente, sem se transformar em zero.",
      status: "DADOS VERIFICADOS",
    },
    {
      label: "Aprovar",
      title: "A revisão vem antes da oferta elegível.",
      text: "No catálogo operacional, editar e aprovar são decisões distintas. A aprovação de uma revisão ainda não é uma nova publicação.",
      status: "REVISÃO APROVADA",
    },
    {
      label: "Publicar",
      title: "Só trocar depois de validar.",
      text: "Uma entrega temporária é preparada e validada. Na falha, a entrega anterior é conservada ou reposta, consoante a fase.",
      status: "NOVA ENTREGA PUBLICADA",
    },
    {
      label: "Guardar",
      title: "A proposta ganha uma versão.",
      text: "O curador revê a proposta baseada na oferta elegível publicada. Guardar cria uma versão identificável; exportar entrega o conteúdo selecionado.",
      status: "SNAPSHOT IDENTIFICÁVEL",
    },
  ];
  function processStatus() {
    const phase = phases[state.phase];
    return `<span class="show-eyebrow">${state.failed ? "FALHA ILUSTRATIVA / PUBLICAÇÃO" : `ETAPA 0${state.phase + 1} / ${phase.status}`}</span><h2>${state.failed ? "A entrega anterior mantém-se." : phase.title}</h2><p>${state.failed ? "A publicação da nova entrega foi interrompida nesta simulação. O estado anterior continua ativo; nenhuma fonte ou base real foi modificada." : phase.text}</p><div class="tech-deliveries"><div class="tech-preserved">${mark}<span>ENTREGA A<strong>${state.phase >= 3 && !state.failed ? "Histórica no exemplo" : "Ativa no exemplo"}</strong></span></div><div class="${state.failed ? "tech-rejected" : ""}"><span>ENTREGA B<strong>${state.failed ? "Não publicada" : state.phase >= 3 ? "Publicada no exemplo" : "Em preparação"}</strong></span></div></div>${source("etl/pipeline.py · etl/portal_catalog.py · dmc-workspace/src/lib/version-store.ts")}`;
  }
  function processScene() {
    return `<div class="tech-process"><div class="show-panel-title"><span>AT-DEMO-01 / REGISTO FICTÍCIO</span><span class="show-tag">SIMULAÇÃO</span></div><div class="tech-track" style="--step:${state.phase}"><div class="tech-track-line" aria-hidden="true"><i></i><span class="tech-record">◆</span></div><div class="tech-phase-buttons" role="group" aria-label="Percurso do registo">${phases.map((phase, i) => `<button type="button" data-tech-phase="${i}" aria-pressed="${state.phase === i}" class="${i <= state.phase ? "is-reached" : ""}"><span>0${i + 1}</span>${phase.label}</button>`).join("")}</div></div><div class="tech-process-controls"><button type="button" class="show-primary" id="tech-advance" ${state.phase === 4 ? "disabled" : ""}>Avançar o dado <span aria-hidden="true">→</span></button><button type="button" class="tech-secondary" id="tech-failure">${state.failed ? "Repor fluxo normal" : "Simular falha na publicação"}</button></div><p class="show-context">As etapas são controladas pelo apresentador. Este fluxo didático não executa ingestão, aprovação ou publicação.</p><div id="tech-process-status" class="tech-process-status" aria-live="polite" aria-atomic="true">${processStatus()}</div></div>`;
  }
  const mechanisms = [
    {
      label: "Regras determinísticas",
      title: "Uma operação com um contrato.",
      steps: ["Comando suportado", "Regras e validação", "Revisão e gravação"],
      text: "Elegibilidade, horários e alterações suportadas têm regras de domínio. Uma resposta no chat não prova, por si só, que um modelo foi chamado.",
      source:
        "dmc-workspace/src/lib/assistant-editing.ts · dmc-workspace/src/lib/curation.ts",
    },
    {
      label: "Agente de linguagem",
      title: "Um modelo com ferramentas.",
      steps: ["Pedido ao agente", "Modelo e ferramentas", "Resposta e revisão"],
      text: "O agente opcional usa ferramentas de catálogo, meteorologia e restrições. Uma resposta livre não se transforma automaticamente numa escrita validada. Confirmar serviço e autorização antes de chamadas reais.",
      source: "src/blu_ai/agents/curator_agent.py · src/blu_ai/llm.py",
    },
    {
      label: "Tradução local",
      title: "Outro modelo, outra responsabilidade.",
      steps: ["Conteúdo exportável", "Tradução local", "Proteção de números"],
      text: "Argos Translate e CTranslate2 traduzem quando os modelos estão preparados. A tradução não confirma factos, preços ou disponibilidade.",
      source: "translations/worker.py · translations/test_worker.py",
    },
  ];
  function mechanismDetail() {
    const item = mechanisms[state.mechanism];
    return `<span class="show-eyebrow">FLUXO ILUSTRADO / SEM CHAMADA A MODELOS</span><h2>${item.title}</h2><div class="tech-ai-route">${item.steps.map((step, i) => `<div style="--order:${i}"><span>0${i + 1}</span><strong>${step}</strong></div>`).join("")}</div><p>${item.text}</p><div class="tech-boundary">${mark}<span>Revisão humana e pendências continuam presentes.</span></div>${source(item.source)}`;
  }
  function aiScene() {
    return `<div class="tech-mechanisms"><div class="tech-part-heading"><span>AI</span><p>A mesma interface pode apoiar<br><strong>mecanismos muito diferentes.</strong></p></div><div role="group" aria-label="Mecanismos do sistema">${mechanisms.map((item, i) => `<button type="button" data-tech-mechanism="${i}" aria-pressed="${state.mechanism === i}"><span>0${i + 1}</span><strong>${item.label}</strong><i aria-hidden="true">→</i></button>`).join("")}</div><p class="show-context">Não é apresentado treino próprio, fine-tuning ou pesquisa vetorial como funcionalidade implementada.</p></div><div id="tech-mechanism-detail" class="tech-detail" aria-live="polite" aria-atomic="true">${mechanismDetail()}</div>`;
  }
  const proofs = [
    {
      label: "Números na tradução",
      kind: "TRADUÇÃO / MODELOS LOCAIS",
      title: "Uma tradução não pode alterar os números.",
      failure: "O modelo altera uma hora ou um valor monetário.",
      contract: "Preservar os valores numéricos ou reportar falha.",
      tests: "translations/test_worker.py",
      limit:
        "O worker é testado com modelo simulado; preservar números não demonstra fluência ou adequação linguística.",
    },
    {
      label: "Escrita desatualizada",
      kind: "VERSÕES / CONCORRÊNCIA",
      title: "Uma revisão antiga não sobrescreve a nova.",
      failure: "Um pedido tenta guardar sobre uma base desatualizada.",
      contract: "Rejeitar o conflito e preservar a versão atual.",
      tests: "dmc-workspace/tests/versions.test.mjs",
      limit:
        "Contratos de versões não equivalem a sincronização multiutilizador completa.",
    },
    {
      label: "Navegação e apresentação",
      kind: "INTERFACE / NAVEGADOR",
      title: "A experiência precisa de continuar utilizável.",
      failure: "Ecrã estreito, teclado ou preferência por menos movimento.",
      contract: "Manter conteúdo acessível, foco e navegação utilizáveis.",
      tests:
        "dmc-workspace/tests/browser/ui.mjs · presentation/test-browser.mjs",
      limit:
        "Testes de navegador e APIs simuladas são evidência técnica localizada; não substituem avaliação com curadores.",
    },
  ];
  function proofDetail() {
    const item = proofs[state.proof];
    return `<span class="show-eyebrow">${item.kind}</span><h2>${item.title}</h2><div class="tech-failure-example"><span>SITUAÇÃO</span><p>${item.failure}</p><i aria-hidden="true">↓</i><span>CONTRATO A VERIFICAR</span><strong>${mark}${item.contract}</strong></div>${source(item.tests)}<p class="tech-evidence-limit">${item.limit}</p>`;
  }
  function validationScene() {
    return `<div class="tech-proof-list"><span class="show-eyebrow">EVIDÊNCIA, NÃO APENAS UMA DEMONSTRAÇÃO</span><h2>O que deve continuar certo<br>quando algo corre mal?</h2><div role="group" aria-label="Contratos testados">${proofs.map((item, i) => `<button type="button" data-tech-proof="${i}" aria-pressed="${state.proof === i}"><span>0${i + 1}</span><strong>${item.label}</strong><i aria-hidden="true">→</i></button>`).join("")}</div><p class="show-context">Estas referências mostram o que verificar; não são uma execução de testes nem uma certificação de produção.</p><div class="show-trust"><h3>Evolução ainda a desenvolver</h3><p>Autenticação e papéis, colaboração multiutilizador, persistência cloud e revisão do acesso externo.</p></div></div><div id="tech-proof-detail" class="tech-detail" aria-live="polite" aria-atomic="true">${proofDetail()}</div>`;
  }
  const scenes = [
    {
      label: "Requisitos",
      className: "tech-requirements",
      heading:
        "Antes da tecnologia,<br><em>o contrato que temos de cumprir.</em>",
      eyebrow: "PARTE I / FUNDAMENTOS TÉCNICOS",
      intro:
        "Quem usa o sistema? O que precisa de fazer? E o que tem de continuar verdadeiro em cada decisão?",
      note: "Uma necessidade torna-se um comportamento verificável.",
      next: "Revelar a arquitetura",
      render: requirementsScene,
    },
    {
      label: "Arquitetura",
      className: "tech-architecture-scene",
      heading:
        "Peças com responsabilidades.<br><em>Ligações com significado.</em>",
      eyebrow: "DO DESENHO À IMPLEMENTAÇÃO",
      intro:
        "Selecione uma camada para revelar responsabilidades e fronteiras. As tecnologias são exploradas no capítulo seguinte.",
      note: "SageMaker é o ambiente de execução; não demonstra treino de um modelo próprio.",
      next: "Explorar as tecnologias",
      render: architectureScene,
    },
    {
      label: "Tecnologias",
      className: "tech-stack-scene",
      heading: "O que foi utilizado.<br><em>E como as peças comunicam.</em>",
      eyebrow: "DEPENDÊNCIAS, IMPLEMENTAÇÃO E AMBIENTE",
      intro:
        "Explore as áreas técnicas e abra os detalhes de implementação. O que está por confirmar fica explícito, para complementar com a informação da equipa.",
      note: "Declarações do projeto e detalhes verificáveis; sem presumir resultados ou decisões históricas.",
      next: "Seguir um dado",
      render: technologiesScene,
    },
    {
      label: "Dados e processos",
      className: "tech-process-scene",
      heading:
        "Um dado percorre o sistema.<br><em>A confiança acompanha-o.</em>",
      eyebrow: "DA FONTE À VERSÃO GUARDADA",
      intro:
        "Avance um registo fictício pelas etapas. Depois, interrompa uma publicação para observar o contrato de recuperação.",
      note: "Editar, aprovar, publicar e guardar uma proposta são operações distintas.",
      next: "Distinguir o papel da IA",
      render: processScene,
    },
    {
      label: "O papel da IA",
      className: "tech-ai",
      heading:
        "Regras, modelos e pessoas.<br><em>Cada um com o seu papel.</em>",
      eyebrow: "MECANISMOS DISTINTOS / LIMITES EXPLÍCITOS",
      intro:
        "Explore o que é determinístico, o que depende de um modelo e o que continua a exigir revisão.",
      note: "Uma proposta gerada não confirma uma reserva ou uma condição comercial.",
      next: "Examinar a evidência",
      render: aiScene,
    },
    {
      label: "Validação e limites",
      className: "tech-validation",
      heading:
        "Não basta funcionar uma vez.<br><em>Importa saber o que protegemos.</em>",
      eyebrow: "CONTRATOS, TESTES E MATURIDADE",
      intro:
        "Explore exemplos de falhas e as verificações que sustentam a engenharia. Separe evidência técnica de avaliação comercial.",
      note: "Já conhecemos as peças. Vamos perceber o que significam numa viagem.",
      next: "Entrar na experiência",
      render: validationScene,
    },
  ];
  function selected(group, key, value) {
    document
      .querySelectorAll(`[data-tech-${group}]`)
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset[key]) === value),
        ),
      );
  }
  function refresh(selector, html) {
    const element = $(selector);
    element.innerHTML = html;
    element.classList.remove("tech-detail-change");
    // Reiniciar apenas o realce visual; o conteúdo fica disponível sem esperar pela animação.
    requestAnimationFrame(() => element.classList.add("tech-detail-change"));
  }
  function updateProcess() {
    $(".tech-track").style.setProperty("--step", state.phase);
    selected("phase", "techPhase", state.phase);
    document
      .querySelectorAll("[data-tech-phase]")
      .forEach((button) =>
        button.classList.toggle(
          "is-reached",
          Number(button.dataset.techPhase) <= state.phase,
        ),
      );
    $("#tech-advance").disabled = state.phase === 4;
    $("#tech-failure").textContent = state.failed
      ? "Repor fluxo normal"
      : "Simular falha na publicação";
    refresh("#tech-process-status", processStatus());
  }
  function drawWires() {
    const host = $(".tech-architecture");
    if (!host) return;
    const svg = host.querySelector("svg"),
      bounds = host.getBoundingClientRect();
    const buttons = [...host.querySelectorAll("[data-tech-node]")];
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    svg.innerHTML = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [3, 5],
    ]
      .map(([from, to]) => {
        const a = buttons[from].getBoundingClientRect(),
          b = buttons[to].getBoundingClientRect();
        const x1 = a.x + a.width / 2 - bounds.x,
          y1 = a.y + a.height / 2 - bounds.y;
        const x2 = b.x + b.width / 2 - bounds.x,
          y2 = b.y + b.height / 2 - bounds.y;
        const active = from === state.node || to === state.node;
        return `<path class="tech-connection ${active ? "is-active" : ""} ${to === 4 ? "is-optional" : ""}" d="M${x1},${y1} C${x1},${(y1 + y2) / 2 + 30} ${x2},${(y1 + y2) / 2 - 30} ${x2},${y2}"/>`;
      })
      .join("");
  }
  function mount() {
    observer?.disconnect();
    const host = $(".tech-architecture");
    if (host) {
      observer = new ResizeObserver(drawWires);
      observer.observe(host);
      drawWires();
    }
  }
  function handleClick(event) {
    const button = event.target.closest(
      "[data-tech-requirement], [data-tech-node], [data-tech-stack], [data-tech-phase], [data-tech-mechanism], [data-tech-proof], #tech-advance, #tech-failure",
    );
    if (!button) return false;
    const data = button.dataset;
    if (data.techRequirement !== undefined) {
      state.requirement = Number(data.techRequirement);
      selected("requirement", "techRequirement", state.requirement);
      refresh("#tech-requirement-detail", requirementDetail());
    }
    if (data.techNode !== undefined) {
      state.node = Number(data.techNode);
      selected("node", "techNode", state.node);
      refresh("#tech-node-detail", nodeDetail());
      drawWires();
    }
    if (data.techStack !== undefined) {
      state.stack = Number(data.techStack);
      selected("stack", "techStack", state.stack);
      refresh("#tech-stack-detail", stackDetail());
    }
    if (data.techPhase !== undefined) {
      state.phase = Number(data.techPhase);
      state.failed = false;
      updateProcess();
    }
    if (button.id === "tech-advance") {
      state.phase = Math.min(4, state.phase + 1);
      state.failed = false;
      updateProcess();
    }
    if (button.id === "tech-failure") {
      state.phase = 3;
      state.failed = !state.failed;
      updateProcess();
    }
    if (data.techMechanism !== undefined) {
      state.mechanism = Number(data.techMechanism);
      selected("mechanism", "techMechanism", state.mechanism);
      refresh("#tech-mechanism-detail", mechanismDetail());
    }
    if (data.techProof !== undefined) {
      state.proof = Number(data.techProof);
      selected("proof", "techProof", state.proof);
      refresh("#tech-proof-detail", proofDetail());
    }
    return true;
  }
  return {
    scenes,
    mount,
    handleClick,
    reset: () => Object.assign(state, initial),
  };
})();
