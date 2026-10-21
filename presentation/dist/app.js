/* Estado exclusivamente em memória: esta demonstração não consulta nem escreve dados do portal. */
const state = {
  scene: 0,
  preference: "culture",
  mode: "classic",
  selected: 0,
  free: false,
  response: null,
  version: 2,
};
const journeyModes = {
  soft: {
    label: "Soft",
    description:
      "Uma forma mais leve de viver a Journey: menos tempo ou profundidade, mantendo a curadoria.",
  },
  classic: {
    label: "Classic",
    description:
      "A abordagem de referência: mais tempo para explorar e uma experiência mais desenvolvida.",
  },
  signature: {
    label: "Signature",
    description:
      "A expressão mais completa da Journey: maior profundidade, riqueza de experiência e personalização.",
  },
};
function modeSelector() {
  return `<div class="show-journey-modes"><span class="show-eyebrow">TRÊS INTERPRETAÇÕES DA MESMA JOURNEY</span><div role="group" aria-label="Abordagem de curadoria">${Object.entries(
    journeyModes,
  )
    .map(
      ([key, mode]) =>
        `<button type="button" data-mode="${key}" aria-pressed="${state.mode === key}">${mode.label}</button>`,
    )
    .join(
      "",
    )}</div><p id="mode-description" aria-live="polite">${journeyModes[state.mode].description}</p><small>Não são graus de qualidade nem tarifas. Nesta ilustração, a seleção explica a abordagem; não recalcula o roteiro ou o preço.</small></div>`;
}
const choices = {
  culture: {
    label: "Cultura & património",
    title: "Um encontro com a história",
    detail: "Visita cultural",
    icon: "compass",
  },
  food: {
    label: "Sabores & encontros",
    title: "A cidade também se prova",
    detail: "Experiência gastronómica",
    icon: "spark",
  },
};
const stops = [
  {
    id: "discovery",
    x: 37,
    y: 39,
    label: "A descoberta",
    area: "O começo da viagem",
    description:
      "Uma experiência alinhada com o interesse escolhido, reservando tempo para explorar sem pressa.",
  },
  {
    id: "table",
    x: 57,
    y: 55,
    label: "À mesa",
    area: "Uma pausa com tempo",
    description:
      "Uma refeição entra no percurso com uma margem própria. Preço e condições ficam por confirmar.",
  },
  {
    id: "horizon",
    x: 72,
    y: 30,
    label: "Outro ponto de vista",
    area: "Um final de dia aberto",
    description:
      "Um momento para observar a cidade. Acesso, esforço e percurso exigem confirmação antes de uma proposta real.",
  },
];
const experienceChapters = [
  "O pedido",
  "O território",
  "A proposta",
  "A colaboração",
  "A entrega",
  "O próximo passo",
];

const icons = {
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  people:
    '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 6h8"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const $ = (selector) => document.querySelector(selector);
// Destino indicado pelo utilizador; não inferir o domínio a partir da apresentação.
const studioPath = window.location.pathname.match(
  /^(.*\/codeeditor\/default\/ports\/)\d+/,
);
const observatoryUrl = studioPath
  ? `${window.location.origin}${studioPath[1]}3001/catalog`
  : "http://localhost:3001/catalog";
$("#portal-link").href = observatoryUrl;

function requestScene() {
  return `<div class="show-mission"><div class="show-orbit" aria-hidden="true"><div></div><div></div><div></div>${icon("compass")}</div><span class="show-coordinate">38°43′ N / 9°08′ W</span><div class="show-mission-label"><span>DESTINO 01</span><strong>Lisboa</strong><p>O próximo capítulo começa aqui.</p></div><span class="show-orbit-caption">${icon("compass")} CADA PESSOA, UM PERCURSO</span></div>
  <div class="show-brief"><div class="show-panel-title">${icon("people")}<span>O seu grupo de demonstração</span><span class="show-tag">02 PESSOAS</span></div><div class="show-facts"><div><small>A duração</small><strong>Dois dias</strong></div><div><small>O ritmo</small><strong>Sem pressa</strong></div><div><small>O que evitar</small><strong>Atividades de barco</strong></div></div><div class="show-question"><span class="show-eyebrow">A PRIMEIRA DECISÃO É SUA</span><h2>O que nos leva a descobrir uma cidade?</h2><div class="show-preferences" role="group" aria-label="Interesse do grupo">${Object.entries(
    choices,
  )
    .map(
      ([key, item]) =>
        `<button type="button" data-preference="${key}" aria-pressed="${state.preference === key}">${icon(item.icon)}<span>${item.label}</span><span class="show-choice-dot" aria-hidden="true">${state.preference === key ? "✓" : ""}</span></button>`,
    )
    .join(
      "",
    )}</div></div><p class="show-context">${icon("shield")} Preferências orientam a proposta. Restrições e informação em falta exigem validação.</p></div>`;
}
function mapScene() {
  return `<div class="show-map" role="group" aria-label="Mapa esquemático de Lisboa com três experiências fictícias"><div class="show-map-grid" aria-hidden="true"></div><svg class="show-map-geography" viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="river" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#204c59"/><stop offset="1" stop-color="#0b2530"/></linearGradient></defs><path fill="url(#river)" d="M0 520 Q170 500 340 545 T610 500 Q740 400 900 450 V620 H0Z"/><g fill="none" stroke="#6a9090" stroke-opacity=".2" stroke-width="1"><path d="M40 90 260 150 440 80 650 160 900 100M0 240 260 150 320 340 570 320 650 160M0 420 180 360 320 340 410 500M570 320 740 400 900 260M440 80 480 230 570 320M180 360 160 210 40 90"/><path d="M80 0 160 210 480 230 620 20M320 340 470 390 740 400 850 0"/></g><path class="show-map-route" d="M333 242 Q380 315 513 341 T648 186" fill="none"/></svg><span class="show-map-caption">LISBOA / POSSIBILIDADES EM LIGAÇÃO</span><span class="show-map-water">TEJO</span>${stops.map((stop, index) => `<button type="button" class="show-map-point ${state.selected === index ? "is-selected" : ""}" style="left:${stop.x}%;top:${stop.y}%" aria-pressed="${state.selected === index}" aria-label="Explorar ${stop.label}" data-stop="${index}"><span>0${index + 1}</span><strong>${stop.label}</strong></button>`).join("")}<span class="show-map-disclaimer">Mapa esquemático · posições e percurso ilustrativos</span></div><div id="place-detail" class="show-place-detail" aria-live="polite" aria-atomic="true">${placeDetail()}</div>`;
}
function placeDetail() {
  const stop = stops[state.selected],
    choice = choices[state.preference];
  return `<div class="show-panel-title">${icon("pin")}<span>POSSIBILIDADE 0${state.selected + 1}</span></div><span class="show-detail-number" aria-hidden="true">0${state.selected + 1}</span><p class="show-eyebrow">${stop.area}</p><h2>${state.selected === 0 ? choice.title : stop.label}</h2><p>${stop.description}</p><dl class="show-evidence"><div><dt>Interesse escolhido</dt><dd>${icon(choice.icon)} ${choice.label}</dd></div><div><dt>Origem destes dados</dt><dd>Exemplo preparado para a apresentação</dd></div><div><dt>Preço e disponibilidade</dt><dd class="show-pending">Por confirmar</dd></div></dl>`;
}
function itineraryScene() {
  const choice = choices[state.preference];
  return `<div class="show-itinerary"><div class="show-panel-title">${icon("route")}<span>O PERCURSO DO GRUPO</span><span class="show-tag">SIMULAÇÃO</span></div><div class="show-day"><div class="show-day-heading"><span>01</span><h2>Descobrir Lisboa</h2><small>Dia 1 / sem pressa</small></div><ol><li><span class="show-time">MANHÃ</span><div><h3>${choice.detail}</h3><p>${choice.label} · escolha alinhada com o briefing</p></div>${icon(choice.icon)}</li><li><span class="show-time">ALMOÇO</span><div><h3>À mesa, com tempo</h3><p>Uma pausa faz parte da experiência</p></div></li><li><span class="show-time">TARDE</span><div><h3>Outro ponto de vista</h3><p>Acesso e deslocação por validar</p></div></li></ol></div><div class="show-day"><div class="show-day-heading"><span>02</span><h2>Ao ritmo de quem viaja</h2><small>Dia 2 / adaptável</small></div><ol><li><span class="show-time">MANHÃ</span><div><h3>Continuar a explorar</h3><p>Margem para uma descoberta local</p></div></li><li id="free-slot" class="${state.free ? "show-free-time" : ""}">${freeSlot()}</li></ol></div></div><div class="show-decision">${modeSelector()}<span class="show-eyebrow">UMA VIAGEM NÃO É ESTÁTICA</span><h2>E se o cliente<br>mudar de ideias?</h2><p>«Preferia ter a segunda tarde livre.»</p><button type="button" id="free-toggle" class="show-primary" aria-pressed="${state.free}">${state.free ? "✓ Repor a experiência" : icon("spark") + "Reservar a tarde livre"}</button><p class="show-change-status" role="status">${changeStatus()}</p></div>`;
}
function freeSlot() {
  return `<span class="show-time">TARDE</span><div><h3>${state.free ? "Uma tarde só sua" : "Uma experiência por escolher"}</h3><p>${state.free ? "Tempo livre reservado · a proposta acompanha o pedido" : "O curador ainda tem uma decisão a rever"}</p></div>${state.free ? icon("moon") : ""}`;
}
function changeStatus() {
  return state.free
    ? "O dia 2 mudou. O interesse escolhido e o dia 1 mantêm-se."
    : "Experimente alterar o plano. Pode voltar atrás.";
}

function collaborationScene() {
  return `<div class="show-conversation"><div class="show-panel-title">${icon("spark")}<span>UMA CONVERSA COM LIMITES</span><span class="show-tag">SIMULAÇÃO PREPARADA</span></div><div class="show-message show-message-human"><small>O CURADOR</small><p>Vamos ajustar o plano, mantendo o que já foi revisto.</p></div><div id="assistant-response" aria-live="polite" aria-atomic="true">${assistantResponse()}</div><p class="show-context">As respostas desta cena estão preparadas. Não existe uma chamada a um modelo de linguagem.</p></div><div class="show-assistant-actions"><span class="show-eyebrow">EXPERIMENTE OS DOIS PEDIDOS</span><h2>Ajudar também é<br>saber onde parar.</h2><button type="button" data-assist="free">${icon("moon")}<span><strong>Reservar uma tarde livre</strong><small>Ajustar a segunda tarde do roteiro</small></span><span aria-hidden="true">→</span></button><button type="button" data-assist="protected">${icon("shield")}<span><strong>Remover uma atividade protegida</strong><small>Testar o limite de uma alteração</small></span><span aria-hidden="true">→</span></button></div>`;
}
function assistantResponse() {
  if (state.response === "protected")
    return `<div class="show-message show-message-assistant show-message-blocked"><small>O LIMITE / EXEMPLO ILUSTRATIVO</small><h3>A atividade protegida mantém-se.</h3><p>Este pedido não é aplicado na demonstração. A proteção exige uma decisão explícita do curador no fluxo adequado.</p><span class="show-response-state">${icon("shield")} SEM ALTERAÇÃO AO ROTEIRO</span></div>`;
  if (state.response === "free")
    return `<div class="show-message show-message-assistant"><small>A ALTERAÇÃO / EXEMPLO ILUSTRATIVO</small><h3>Uma tarde livre no dia 2.</h3><p>A demonstração reservou o período. O interesse escolhido e o primeiro dia mantêm-se; pode verificar o resultado no capítulo A proposta.</p><span class="show-response-state">✓ DEMONSTRAÇÃO ATUALIZADA</span></div>`;
  return `<div class="show-message show-message-assistant"><small>A ASSISTÊNCIA</small><h3>Qual é a próxima decisão?</h3><p>Escolha um pedido ao lado para observar uma alteração permitida ou um limite de proteção.</p></div>`;
}
function deliveryScene() {
  return `<div class="show-document-wrap"><div class="show-version-switch" role="group" aria-label="Exemplos de versões"><button type="button" data-version="1" aria-pressed="${state.version === 1}">01 / Exemplo inicial</button><button type="button" data-version="2" aria-pressed="${state.version === 2}">02 / As suas escolhas</button></div><div id="document-preview" class="show-document" aria-live="polite" aria-atomic="true">${documentPreview()}</div><p class="show-context">Pré-visualização ilustrativa. Não é um PDF exportado nem uma versão guardada no portal.</p></div><div class="show-delivery-detail"><span class="show-eyebrow">AS ESCOLHAS TORNAM-SE VISÍVEIS</span><h2>A sua viagem,<br>nas suas escolhas.</h2><dl class="show-choice-summary"><div><dt>O interesse</dt><dd>${choices[state.preference].label}</dd></div><div><dt>A abordagem</dt><dd>${journeyModes[state.mode].label} · dois dias, sem pressa</dd></div><div><dt>A segunda tarde</dt><dd>${state.free ? "Tempo livre reservado" : "Uma experiência por escolher"}</dd></div></dl><p class="show-context">Compare o ponto de partida com as escolhas que fez. No portal real, o curador revê e guarda a proposta antes da entrega. Para a composição visual, exporta TXT com JSON para o plugin Canva, trabalha numa cópia do modelo BLU e revê o PDF. O PDF Canva não substitui o PDF DMC nem atualiza a partilha.</p></div>`;
}
function documentPreview() {
  const current = state.version === 2;
  return `<div class="show-document-brand">blu<span>.</span><small>TRAVEL CURATION / EXEMPLO</small></div><span class="show-eyebrow">PORTUGAL / DOIS DIAS</span><h2>Lisboa,<br>ao seu ritmo.</h2><p class="show-document-intro">${current ? choices[state.preference].label : choices.culture.label} · ${current ? journeyModes[state.mode].label : "Classic"} · dois adultos · sem pressa</p><div class="show-document-days"><div><span>01</span><h3>Descobrir Lisboa</h3><p>${current ? choices[state.preference].detail : choices.culture.detail}<br>À mesa, com tempo<br>Outro ponto de vista</p></div><div><span>02</span><h3>Continuar a explorar</h3><p>${current && state.free ? "Uma tarde só sua · tempo livre reservado" : "Uma experiência por escolher"}</p></div></div><div class="show-document-pending">PREÇO E DISPONIBILIDADE POR CONFIRMAR</div><small class="show-document-footer">GRUPO DEMONSTRAÇÃO BLU / EXEMPLO 0${state.version}</small>`;
}
function finalScene() {
  return `<div class="show-finale"><div class="show-final-symbol" aria-hidden="true">${icon("compass")}</div><div class="show-final-summary"><span>02 dias em Lisboa</span><span>${choices[state.preference].label}</span><span>${state.free ? "Uma tarde livre reservada" : "Um roteiro ainda por rever"}</span></div><a id="observatory-final" class="show-primary" href="${observatoryUrl}" target="_blank" rel="noopener noreferrer">Explorar o Observatório real <span aria-hidden="true">↗</span></a><p class="show-final-note">Abre o portal real num novo separador. O acesso depende da sua sessão SageMaker.</p><div class="show-project-conclusion"><h2>Do conhecimento disperso à proposta revista.</h2><p>O contributo é ligar fontes rastreáveis, regras de curadoria e versões identificáveis. A automação prepara; o curador decide e aprova a entrega.</p><p>A evolução proposta é o autosserviço do cliente e a ligação ao CRM, com reservas, pagamentos e comunicações sujeitos a desenvolvimento e validação.</p><small>Grupo 4 · Fernando Carvalheiro · Gisela Matos · Henrique Reduto · Manuel Amaral · Pedro Carreiro<br>PG Applied AI &amp; Machine Learning · 5.ª edição · Apresentação prevista: 30 de outubro de 2026</small></div><div class="show-final-principles"><span>${icon("compass")} Conhecimento com origem</span><span>${icon("shield")} Revisão humana</span><span>${icon("route")} Entregas identificáveis</span></div></div>`;
}
const experienceScenes = [
  {
    heading: "Dois dias em Lisboa.<br><em>Uma viagem à sua medida.</em>",
    eyebrow: "CADA VIAGEM COMEÇA COM ALGUÉM",
    intro:
      "Antes de escolher um lugar, precisamos de conhecer as pessoas. Vamos começar por uma decisão sua.",
    note: "Primeiro as pessoas. Depois os lugares.",
    next: "Explorar o território",
    render: requestScene,
  },
  {
    heading: "O território é o começo.<br><em>O contexto faz a escolha.</em>",
    eyebrow: "CONHECIMENTO QUE ORIENTA",
    intro:
      "Cada ponto é uma possibilidade. Explore o mapa e descubra o contexto por trás da escolha.",
    note: "Uma escolha ganha valor quando tem contexto.",
    next: "Dar forma à viagem",
    render: mapScene,
  },
  {
    heading: "De possibilidades<br><em>a um plano com sentido.</em>",
    eyebrow: "CURADORIA EM MOVIMENTO",
    intro:
      "O pedido e o interesse escolhido encontram-se num roteiro. Agora, veja o que muda quando o cliente muda de ideias.",
    note: "Uma proposta para rever, adaptar e entregar.",
    next: "Continuar a revisão",
    render: itineraryScene,
  },
  {
    heading: "Inteligência para ajudar.<br><em>Critério para decidir.</em>",
    eyebrow: "ASSISTÊNCIA COM FRONTEIRAS",
    intro:
      "Uma alteração útil tem de respeitar o plano e os seus limites. Experimente duas situações numa conversa preparada.",
    note: "Assistência, validação e revisão humana.",
    next: "Preparar a entrega",
    render: collaborationScene,
  },
  {
    heading: "A viagem muda.<br><em>O histórico permanece.</em>",
    eyebrow: "DA REVISÃO À ENTREGA",
    intro:
      "Compare o exemplo inicial com as escolhas que fez. No sistema, uma entrega corresponde a uma versão guardada.",
    note: "Rever, guardar e entregar são passos distintos.",
    next: "Abrir o próximo capítulo",
    render: deliveryScene,
  },
  {
    heading: "Da informação à decisão.<br><em>Da decisão à viagem.</em>",
    eyebrow: "BLU / THE CURATION EXPERIENCE",
    intro:
      "O percurso termina aqui. A exploração do sistema pode começar agora.",
    note: "Obrigado por acompanhar esta viagem.",
    next: "Recomeçar",
    render: finalScene,
  },
];
const technicalCount = window.BluTechnical.scenes.length;
const scenes = [
  ...window.BluTechnical.scenes,
  ...experienceScenes.map((scene, index) => ({
    ...scene,
    label: experienceChapters[index],
    id: ["request", "map", "itinerary", "collaboration", "delivery", "final"][
      index
    ],
  })),
];
function render(focus = true) {
  const scene = scenes[state.scene];
  const technical = state.scene < technicalCount;
  const offset = technical ? 0 : technicalCount;
  const group = technical
    ? window.BluTechnical.scenes
    : scenes.slice(technicalCount);
  const localIndex = state.scene - offset;
  $("#experience").dataset.part = technical ? "technical" : "experience";
  $("#show-title").innerHTML = scene.heading;
  $("#eyebrow").textContent = "BLU INTELLIGENCE / " + scene.eyebrow;
  $("#intro").textContent = scene.intro;
  $(".show-parts").innerHTML =
    `<button type="button" data-part="technical" ${technical ? 'aria-current="step"' : ""}><span>I</span><strong>Fundamentos técnicos</strong><small>Como foi construído</small></button><button type="button" data-part="experience" ${!technical ? 'aria-current="step"' : ""}><span>II</span><strong>Experiência de curadoria</strong><small>O significado na prática</small></button><a href="${observatoryUrl}" target="_blank" rel="noopener noreferrer"><span>III</span><strong>Portal real ↗</strong><small>Aplicação em novo separador</small></a>`;
  $(".show-chapters").classList.toggle("show-technical-chapters", technical);
  $(".show-chapters").innerHTML = group
    .map(
      (item, index) =>
        `<button type="button" data-scene="${index + offset}" ${localIndex === index ? 'aria-current="step"' : ""}><span>0${index + 1}</span>${item.label}<i aria-hidden="true"></i></button>`,
    )
    .join("");
  $("#scene").className =
    `show-scene ${technical ? scene.className : `show-scene-${scene.id}`}`;
  $("#scene").innerHTML = scene.render();
  $("#counter").textContent =
    `${technical ? "I" : "II"} · 0${localIndex + 1} / 0${group.length}`;
  $("#conclusion").textContent = scene.note;
  $("#previous").disabled = state.scene === 0;
  $("#next").innerHTML =
    scene.next +
    `<span aria-hidden="true">${state.scene === scenes.length - 1 ? "↺" : "→"}</span>`;
  $(".show-demo").innerHTML =
    `<span></span>${technical ? "FUNDAMENTOS / FLUXOS ILUSTRADOS" : "DEMONSTRAÇÃO · CASO FICTÍCIO"}`;
  $(".show-bottom-note").textContent = technical
    ? "CONTEÚDO BASEADO NO PROJETO · sem executar ETL, testes, modelos ou alterações a dados"
    : "PROTÓTIPO INDEPENDENTE · sem geração por IA, reservas ou alterações a dados reais";
  window.BluTechnical.mount();
  if (focus) {
    $("#show-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}

function go(scene) {
  state.scene = Math.max(0, Math.min(scenes.length - 1, scene));
  render();
}
$("#next").addEventListener("click", () => {
  if (state.scene === scenes.length - 1) {
    Object.assign(state, {
      scene: 0,
      preference: "culture",
      mode: "classic",
      selected: 0,
      free: false,
      response: null,
      version: 2,
    });
    window.BluTechnical.reset();
    render();
  } else go(state.scene + 1);
});

$("#previous").addEventListener("click", () => go(state.scene - 1));
$(".show-chapters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene]");
  if (button) go(Number(button.dataset.scene));
});
$(".show-parts").addEventListener("click", (event) => {
  const button = event.target.closest("[data-part]");
  if (button) go(button.dataset.part === "technical" ? 0 : technicalCount);
});
$("#scene").addEventListener("click", (event) => {
  if (window.BluTechnical.handleClick(event)) return;
  const mode = event.target.closest("[data-mode]");
  if (mode && journeyModes[mode.dataset.mode]) {
    state.mode = mode.dataset.mode;
    document
      .querySelectorAll("[data-mode]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.mode === state.mode),
        ),
      );
    $("#mode-description").textContent = journeyModes[state.mode].description;
  }
  const assist = event.target.closest("[data-assist]");
  if (assist) {
    state.response = assist.dataset.assist;
    if (state.response === "free") state.free = true;
    $("#assistant-response").innerHTML = assistantResponse();
  }
  const version = event.target.closest("[data-version]");
  if (version) {
    state.version = Number(version.dataset.version);
    document
      .querySelectorAll("[data-version]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.version) === state.version),
        ),
      );
    $("#document-preview").innerHTML = documentPreview();
  }
  const preference = event.target.closest("[data-preference]");
  if (preference) {
    state.preference = preference.dataset.preference;
    document.querySelectorAll("[data-preference]").forEach((button) => {
      const active = button.dataset.preference === state.preference;
      button.setAttribute("aria-pressed", String(active));
      button.querySelector(".show-choice-dot").textContent = active ? "✓" : "";
    });
  }
  const stop = event.target.closest("[data-stop]");
  if (stop) {
    state.selected = Number(stop.dataset.stop);
    document.querySelectorAll("[data-stop]").forEach((button) => {
      const active = Number(button.dataset.stop) === state.selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#place-detail").innerHTML = placeDetail();
  }
  if (event.target.closest("#free-toggle")) {
    state.free = !state.free;
    $("#free-slot").classList.toggle("show-free-time", state.free);
    $("#free-slot").innerHTML = freeSlot();
    $("#free-toggle").setAttribute("aria-pressed", String(state.free));
    $("#free-toggle").innerHTML = state.free
      ? "✓ Repor a experiência"
      : icon("spark") + "Reservar a tarde livre";
    $(".show-change-status").textContent = changeStatus();
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.closest("input, textarea, select")
  )
    return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    go(state.scene + (event.key === "ArrowRight" ? 1 : -1));
  }
});
$("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $("#fullscreen-note").hidden = true;
  } catch {
    $("#fullscreen-note").textContent =
      "O navegador não permitiu ecrã inteiro. A apresentação continua nesta janela.";
    $("#fullscreen-note").hidden = false;
  }
});
$("#motion-toggle").addEventListener("click", () => {
  const paused = $("#experience").dataset.motion !== "off";
  $("#experience").dataset.motion = paused ? "off" : "on";
  const label = paused ? "Ativar animações" : "Pausar animações";
  $("#motion-toggle").setAttribute("aria-label", label);
  $("#motion-toggle").setAttribute("title", label);
  $("#motion-toggle").setAttribute("aria-pressed", String(paused));
  $("#motion-toggle").textContent = paused ? "▷" : "Ⅱ";
});
render(false);
