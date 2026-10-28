// Pitch independente: escolhas ilustrativas em memória, sem APIs, reservas ou dados de clientes.
const state = {
  scene: 0,
  preference: "culture",
  selected: 0,
  free: false,
  audience: "travellers",
};
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
const contactUrl = "https://wa.me/351915784212";

const audiences = {
  travellers: {
    label: "Para quem viaja",
    heading: "A próxima viagem começa<br>com uma conversa.",
    text: "Conte-nos o que o inspira, quando gostaria de viajar e com quem. O primeiro passo é conhecê-lo.",
    action: "Falar sobre a minha viagem",
    message:
      "Olá BLU, gostaria de falar com um curador sobre uma viagem a Portugal.",
    steps: [
      "Partilhar interesses e expectativas",
      "Conversar sobre as possibilidades",
      "Rever uma proposta à sua medida",
    ],
  },
  partners: {
    label: "Para parceiros",
    heading: "Os seus clientes.<br>Uma experiência com intenção.",
    text: "Conversemos sobre o perfil dos seus clientes e o papel da BLU na curadoria de experiências em Portugal.",
    action: "Conversar sobre uma parceria",
    message:
      "Olá BLU, gostaria de conversar sobre uma possível parceria para experiências em Portugal.",
    steps: [
      "Conhecer o perfil dos seus clientes",
      "Explorar uma colaboração com a BLU",
      "Definir âmbito e próximos passos",
    ],
  },
};

function promiseScene() {
  return `<div class="show-mission pitch-hero"><div class="show-orbit" aria-hidden="true"><div></div><div></div><div></div>${icon("compass")}</div><span class="show-coordinate">PORTUGAL / À SUA MANEIRA</span><div class="show-mission-label"><span>BLU COSTA TRAVEL CURATION</span><strong>Viajar.<br>Com intenção.</strong><p>O lugar é o começo.<br>A experiência é pessoal.</p></div></div>
  <div class="pitch-promise"><span class="show-eyebrow">O LUXO DE UMA ESCOLHA COM SENTIDO</span><h2>Conhecer quem viaja.<br>Escolher com intenção.</h2><p>Uma cidade pode ser vivida de muitas formas. A curadoria liga os seus interesses, o seu ritmo e os momentos que quer levar consigo.</p><div class="pitch-pillars"><div>${icon("people")}<h3>Escuta</h3><p>Começamos pelas pessoas.</p></div><div>${icon("compass")}<h3>Curadoria</h3><p>Damos contexto às escolhas.</p></div><div>${icon("route")}<h3>Cuidado</h3><p>A proposta é revista consigo.</p></div></div></div>`;
}
function requestScene() {
  return `<div class="pitch-person"><span class="show-eyebrow">IMAGINE A SUA PRÓXIMA VIAGEM</span><h2>Dois dias.<br>Uma cidade.<br><em>O seu ritmo.</em></h2><p>Lisboa, dois adultos e tempo para descobrir sem pressa. Neste exemplo, deixamos de fora as atividades de barco.</p><span class="pitch-caption">CASO ILUSTRATIVO / NÃO É UMA OFERTA COMERCIAL</span></div>
  <div class="show-brief"><div class="show-panel-title">${icon("people")}<span>O ponto de partida</span></div><div class="show-facts"><div><small>A duração</small><strong>Dois dias</strong></div><div><small>O ritmo</small><strong>Sem pressa</strong></div></div><div class="show-question"><span class="show-eyebrow">UMA ESCOLHA PARA EXPERIMENTAR</span><h2>O que o inspira?</h2><div class="show-preferences" role="group" aria-label="Interesse da viagem">${Object.entries(
    choices,
  )
    .map(
      ([key, item]) =>
        `<button type="button" data-preference="${key}" aria-pressed="${state.preference === key}">${icon(item.icon)}<span>${item.label}</span><span class="show-choice-dot" aria-hidden="true">${state.preference === key ? "✓" : ""}</span></button>`,
    )
    .join(
      "",
    )}</div></div><p class="show-context">Esta escolha acompanha o percurso e a proposta ilustrativa dos próximos momentos.</p></div>`;
}
function mapScene() {
  return `<div class="show-map" role="group" aria-label="Mapa esquemático de Lisboa com três experiências fictícias"><div class="show-map-grid" aria-hidden="true"></div><svg class="show-map-geography" viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="river" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#204c59"/><stop offset="1" stop-color="#0b2530"/></linearGradient></defs><path fill="url(#river)" d="M0 520 Q170 500 340 545 T610 500 Q740 400 900 450 V620 H0Z"/><g fill="none" stroke="#6a9090" stroke-opacity=".2" stroke-width="1"><path d="M40 90 260 150 440 80 650 160 900 100M0 240 260 150 320 340 570 320 650 160M0 420 180 360 320 340 410 500M570 320 740 400 900 260M440 80 480 230 570 320M180 360 160 210 40 90"/><path d="M80 0 160 210 480 230 620 20M320 340 470 390 740 400 850 0"/></g><path class="show-map-route" d="M333 242 Q380 315 513 341 T648 186" fill="none"/></svg><span class="show-map-caption">LISBOA / POSSIBILIDADES EM LIGAÇÃO</span><span class="show-map-water">TEJO</span>${stops.map((stop, index) => `<button type="button" class="show-map-point ${state.selected === index ? "is-selected" : ""}" style="left:${stop.x}%;top:${stop.y}%" aria-pressed="${state.selected === index}" aria-label="Explorar ${stop.label}" data-stop="${index}"><span>0${index + 1}</span><strong>${stop.label}</strong></button>`).join("")}<span class="show-map-disclaimer">Mapa esquemático · posições e percurso ilustrativos</span></div><div id="place-detail" class="show-place-detail" aria-live="polite" aria-atomic="true">${placeDetail()}</div>`;
}
function placeDetail() {
  const stop = stops[state.selected],
    choice = choices[state.preference];
  return `<div class="show-panel-title">${icon("pin")}<span>POSSIBILIDADE 0${state.selected + 1}</span></div><span class="show-detail-number" aria-hidden="true">0${state.selected + 1}</span><p class="show-eyebrow">${stop.area}</p><h2>${state.selected === 0 ? choice.title : stop.label}</h2><p>${stop.description}</p><dl class="show-evidence"><div><dt>Interesse escolhido</dt><dd>${icon(choice.icon)} ${choice.label}</dd></div><div><dt>Sobre este percurso</dt><dd>Exemplo ilustrativo de uma viagem</dd></div><div><dt>Preço e disponibilidade</dt><dd class="show-pending">Por confirmar</dd></div></dl>`;
}

function itineraryScene() {
  const choice = choices[state.preference];
  return `<div class="show-itinerary"><div class="show-panel-title">${icon("route")}<span>Um percurso possível</span><span class="show-tag">ILUSTRATIVO</span></div><div class="show-day"><div class="show-day-heading"><span>01</span><h2>Descobrir Lisboa</h2><small>Dia 1</small></div><ol><li><span class="show-time">MANHÃ</span><div><h3>${choice.detail}</h3><p>${choice.label}</p></div>${icon(choice.icon)}</li><li><span class="show-time">ALMOÇO</span><div><h3>À mesa, com tempo</h3><p>A pausa também faz parte da viagem.</p></div></li></ol></div><div class="show-day"><div class="show-day-heading"><span>02</span><h2>Ao seu ritmo</h2><small>Dia 2</small></div><ol><li id="free-slot" class="${state.free ? "show-free-time" : ""}">${freeSlot()}</li></ol></div></div>
  <div class="show-decision"><span class="show-eyebrow">CONSTRUÍDA EM CONJUNTO</span><h2>Os planos mudam.<br>A escuta continua.</h2><blockquote>«Gostava de ter a segunda tarde só para mim.»</blockquote><p>O curador revê o pedido e ajusta a proposta consigo. A tecnologia apoia a preparação; a decisão continua humana.</p><button type="button" id="free-toggle" class="show-primary" aria-pressed="${state.free}">${state.free ? "Repor o exemplo inicial" : "Experimentar uma tarde livre"}</button><p class="show-change-status" role="status">${changeStatus()}</p></div>`;
}
function freeSlot() {
  return `<span class="show-time">TARDE</span><div><h3>${state.free ? "Uma tarde só sua" : "Uma descoberta por escolher"}</h3><p>${state.free ? "Tempo livre no exemplo · sem reserva de serviços" : "Uma possibilidade a conversar com o curador"}</p></div>${state.free ? icon("moon") : ""}`;
}
function changeStatus() {
  return state.free
    ? "A segunda tarde ficou livre no exemplo. O primeiro dia mantém-se."
    : "Veja como o percurso se adapta, sem mudar o primeiro dia.";
}
function documentPreview() {
  return `<div class="show-document-brand">blu<span>.</span><small>TRAVEL CURATION / EXEMPLO</small></div><span class="show-eyebrow">PORTUGAL / DOIS DIAS</span><h2>Lisboa,<br>ao seu ritmo.</h2><p class="show-document-intro">${choices[state.preference].label} · dois adultos · sem pressa</p><div class="show-document-days"><div><span>01</span><h3>Descobrir Lisboa</h3><p>${choices[state.preference].detail}<br>À mesa, com tempo</p></div><div><span>02</span><h3>Continuar a explorar</h3><p>${state.free ? "Uma tarde só sua · tempo livre" : "Uma descoberta por escolher"}</p></div></div><div class="show-document-pending">PREÇO, DISPONIBILIDADE E CONDIÇÕES POR CONFIRMAR</div><small class="show-document-footer">PROPOSTA ILUSTRATIVA / NÃO CONSTITUI RESERVA</small>`;
}
function deliveryScene() {
  return `<div class="show-document-wrap"><div class="show-document">${documentPreview()}</div></div><div class="show-delivery-detail"><span class="show-eyebrow">DO DIÁLOGO À PROPOSTA</span><h2>A viagem ganha forma.<br>Consigo, até ao detalhe.</h2><p>Um percurso legível, escolhas com contexto e espaço para rever o que importa antes de avançar.</p><dl class="show-choice-summary"><div><dt>O que o inspira</dt><dd>${choices[state.preference].label}</dd></div><div><dt>O seu ritmo</dt><dd>Dois dias, sem pressa</dd></div><div><dt>A segunda tarde</dt><dd>${state.free ? "Tempo livre" : "Uma descoberta por escolher"}</dd></div></dl><p class="show-context">Este é um exemplo visual, não um documento comercial emitido. Preços, disponibilidade e condições exigem confirmação. Uma proposta não equivale a uma reserva.</p></div>`;
}
// O contacto abre apenas por ação do visitante; não envia mensagens nem publica o exemplo.
function finalScene() {
  const audience = audiences[state.audience];
  const href = `${contactUrl}?text=${encodeURIComponent(audience.message)}`;
  return `<div class="pitch-contact"><div class="pitch-audiences" role="group" aria-label="Escolher o objetivo do contacto">${Object.entries(
    audiences,
  )
    .map(
      ([key, value]) =>
        `<button type="button" data-audience="${key}" aria-pressed="${state.audience === key}">${value.label}</button>`,
    )
    .join(
      "",
    )}</div><div class="pitch-contact-copy"><span class="show-eyebrow">BLU COSTA TRAVEL CURATION</span><h2>${audience.heading}</h2><p>${audience.text}</p><a id="contact-final" class="show-primary" href="${href}" target="_blank" rel="noopener noreferrer">${audience.action}<span aria-hidden="true">↗</span></a><p class="show-context">Abre o WhatsApp com um texto inicial. A mensagem só é enviada por si.</p></div></div><div class="pitch-next-steps"><span class="show-eyebrow">O PRÓXIMO CAPÍTULO</span><ol>${audience.steps.map((text, index) => `<li><span>0${index + 1}</span><p>${text}</p></li>`).join("")}</ol><p class="pitch-signature">Conhecer. Escolher. Viver.</p></div>`;
}
const scenes = [
  {
    id: "promise",
    label: "A promessa",
    heading:
      "Portugal, com intenção.<br><em>Uma viagem que faz sentido para si.</em>",
    eyebrow: "CADA PESSOA, UM PERCURSO",
    intro: "Curadoria de viagens para ligar quem é aos lugares que quer viver.",
    note: "Conhecer quem viaja. Escolher com intenção.",
    next: "Começar pelas pessoas",
    render: promiseScene,
  },
  {
    id: "request",
    label: "A sua viagem",
    heading: "Antes dos lugares,<br><em>vem a sua história.</em>",
    eyebrow: "COMEÇAMOS POR OUVIR",
    intro:
      "Interesses, ritmo e expectativas dão o primeiro sentido à viagem. Experimente uma escolha neste exemplo.",
    note: "Primeiro as pessoas. Depois os lugares.",
    next: "Descobrir Lisboa",
    render: requestScene,
  },
  {
    id: "map",
    label: "O destino",
    heading:
      "Conhecer o lugar.<br><em>Escolher o que lhe diz alguma coisa.</em>",
    eyebrow: "O CONTEXTO FAZ A DIFERENÇA",
    intro:
      "Uma descoberta, uma mesa, outro ponto de vista. Explore três possibilidades de um percurso ilustrativo em Lisboa.",
    note: "Um destino. Muitas formas de o viver.",
    next: "Construir em conjunto",
    render: mapScene,
  },
  {
    id: "itinerary",
    label: "A curadoria",
    heading: "Uma proposta que se constrói<br><em>em conversa consigo.</em>",
    eyebrow: "TECNOLOGIA AO SERVIÇO DA CURADORIA",
    intro:
      "O curador transforma preferências em escolhas e revê o percurso consigo. Experimente deixar uma tarde livre.",
    note: "A tecnologia apoia. O curador revê. A viagem é sua.",
    next: "Ver a proposta",
    render: itineraryScene,
  },
  {
    id: "delivery",
    label: "A proposta",
    heading:
      "Mais do que uma lista de lugares.<br><em>Um percurso com sentido.</em>",
    eyebrow: "AS SUAS ESCOLHAS GANHAM FORMA",
    intro:
      "O exemplo acompanha o interesse e o ritmo que escolheu. O próximo passo é rever os detalhes com a BLU.",
    note: "Uma proposta clara. Espaço para decidir.",
    next: "Vamos conversar",
    render: deliveryScene,
  },
  {
    id: "final",
    label: "Vamos conversar",
    heading: "O próximo capítulo<br><em>pode começar aqui.</em>",
    eyebrow: "PARA VIAJANTES E PARCEIROS",
    intro:
      "Uma viagem pessoal ou uma oportunidade de colaboração: comece por nos contar o que tem em mente.",
    note: "BLU Costa Travel Curation",
    next: "Recomeçar",
    render: finalScene,
  },
];

function render(focus = true) {
  const scene = scenes[state.scene];
  $("#show-title").innerHTML = scene.heading.replaceAll("<br>", "<br> ");
  $("#eyebrow").textContent = scene.eyebrow;
  $("#intro").textContent = scene.intro;
  $(".show-chapters").innerHTML = scenes
    .map(
      (item, index) =>
        `<button type="button" aria-label="0${index + 1} ${item.label}" data-scene="${index}" ${state.scene === index ? 'aria-current="step"' : ""}><span>0${index + 1}</span>${item.label}<i aria-hidden="true"></i></button>`,
    )
    .join("");
  $("#chapter-select").innerHTML = scenes
    .map(
      (item, index) =>
        `<option value="${index}" ${index === state.scene ? "selected" : ""}>0${index + 1} · ${item.label}</option>`,
    )
    .join("");
  $("#scene").className = `show-scene show-scene-${scene.id}`;
  $("#scene").innerHTML = scene.render();
  $("#counter").textContent = `0${state.scene + 1} / 06`;
  $("#conclusion").textContent = scene.note;
  $("#previous").disabled = state.scene === 0;
  $("#next").innerHTML =
    scene.next +
    `<span aria-hidden="true">${state.scene === scenes.length - 1 ? "↺" : "→"}</span>`;
  window.BluViewport.refresh(true);
  if (focus) $("#show-title").focus({ preventScroll: true });
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
      selected: 0,
      free: false,
      audience: "travellers",
    });
    render();
  } else go(state.scene + 1);
});
$("#chapter-select").addEventListener("change", (event) =>
  go(Number(event.target.value)),
);
$("#previous").addEventListener("click", () => go(state.scene - 1));
$(".show-chapters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene]");
  if (button) go(Number(button.dataset.scene));
});
$("#contact-jump").addEventListener("click", () => go(5));
$(".show-brand").addEventListener("click", (event) => {
  event.preventDefault();
  go(0);
});
$("#scene").addEventListener("click", (event) => {
  const preference = event.target.closest("[data-preference]");
  if (preference && choices[preference.dataset.preference]) {
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
    $("#free-toggle").textContent = state.free
      ? "Repor o exemplo inicial"
      : "Experimentar uma tarde livre";
    $(".show-change-status").textContent = changeStatus();
  }
  const audience = event.target.closest("[data-audience]");
  if (audience && audiences[audience.dataset.audience]) {
    state.audience = audience.dataset.audience;
    $("#scene").innerHTML = finalScene();
    // Repor o foco no seletor após atualizar o encerramento para o público escolhido.
    $(`[data-audience="${state.audience}"]`).focus({ preventScroll: true });
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
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (!window.BluViewport.step(direction)) go(state.scene + direction);
  }
});
$("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $("#fullscreen-note").hidden = true;
  } catch {
    $("#fullscreen-note").textContent =
      "O navegador não permitiu ecrã inteiro. O pitch continua nesta janela.";
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
