/* Estado exclusivamente em memória: esta demonstração não consulta nem escreve dados do portal. */
const state = { scene: 0, preference: "culture", selected: 0, free: false };
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
const chapters = ["O pedido", "O território", "A proposta"];
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
const portal = new URL(location.href);
portal.port = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  ? "3001"
  : location.port;
portal.pathname = location.pathname.startsWith("/codeeditor/")
  ? "/codeeditor/default/ports/3001/catalog"
  : "/catalog";
portal.search = "";
portal.hash = "";
$("#portal-link").href = portal.href;

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
  return `<div class="show-panel-title">${icon("pin")}<span>POSSIBILIDADE 0${state.selected + 1}</span></div><span class="show-detail-number" aria-hidden="true">0${state.selected + 1}</span><p class="show-eyebrow">${stop.area}</p><h2>${state.selected === 0 ? choice.title : stop.label}</h2><p>${stop.description}</p><dl class="show-evidence"><div><dt>Interesse escolhido</dt><dd>${icon(choice.icon)} ${choice.label}</dd></div><div><dt>Origem destes dados</dt><dd>Exemplo preparado para a apresentação</dd></div><div><dt>Preço e disponibilidade</dt><dd class="show-pending">Por confirmar</dd></div></dl><p class="show-context">${icon("compass")} No sistema, cada registo mantém a sua origem consultável. Estas ofertas são fictícias.</p>`;
}
function itineraryScene() {
  const choice = choices[state.preference];
  return `<div class="show-itinerary"><div class="show-panel-title">${icon("route")}<span>O PERCURSO DO GRUPO</span><span class="show-tag">SIMULAÇÃO</span></div><div class="show-day"><div class="show-day-heading"><span>01</span><h2>Descobrir Lisboa</h2><small>Dia 1 / sem pressa</small></div><ol><li><span class="show-time">MANHÃ</span><div><h3>${choice.detail}</h3><p>${choice.label} · escolha alinhada com o briefing</p></div>${icon(choice.icon)}</li><li><span class="show-time">ALMOÇO</span><div><h3>À mesa, com tempo</h3><p>Uma pausa faz parte da experiência</p></div></li><li><span class="show-time">TARDE</span><div><h3>Outro ponto de vista</h3><p>Acesso e deslocação por validar</p></div></li></ol></div><div class="show-day"><div class="show-day-heading"><span>02</span><h2>Ao ritmo de quem viaja</h2><small>Dia 2 / adaptável</small></div><ol><li><span class="show-time">MANHÃ</span><div><h3>Continuar a explorar</h3><p>Margem para uma descoberta local</p></div></li><li id="free-slot" class="${state.free ? "show-free-time" : ""}">${freeSlot()}</li></ol></div></div><div class="show-decision"><span class="show-eyebrow">UMA VIAGEM NÃO É ESTÁTICA</span><h2>E se o cliente<br>mudar de ideias?</h2><p>«Preferia ter a segunda tarde livre.»</p><button type="button" id="free-toggle" class="show-primary" aria-pressed="${state.free}">${state.free ? "✓ Repor a experiência" : icon("spark") + "Reservar a tarde livre"}</button><p class="show-change-status" role="status">${changeStatus()}</p><div class="show-trust">${icon("shield")}<h3>O curador continua presente.</h3><p>Esta interação altera apenas a demonstração. No portal, a proposta é revista e guardada numa versão antes da entrega.</p></div><a href="${portal.href}" target="_blank" rel="noopener" class="show-system-link">Explorar o Observatório real <span aria-hidden="true">↗</span></a></div>`;
}
function freeSlot() {
  return `<span class="show-time">TARDE</span><div><h3>${state.free ? "Uma tarde só sua" : "Uma experiência por escolher"}</h3><p>${state.free ? "Tempo livre reservado · a proposta acompanha o pedido" : "O curador ainda tem uma decisão a rever"}</p></div>${state.free ? icon("moon") : ""}`;
}
function changeStatus() {
  return state.free
    ? "O dia 2 mudou. O interesse escolhido e o dia 1 mantêm-se."
    : "Experimente alterar o plano. Pode voltar atrás.";
}
function render(focus = true) {
  const headings = [
    "Dois dias em Lisboa.<br><em>Uma viagem à sua medida.</em>",
    "O território é o começo.<br><em>O contexto faz a escolha.</em>",
    "De possibilidades<br><em>a um plano com sentido.</em>",
  ];
  $("#show-title").innerHTML = headings[state.scene];
  $("#eyebrow").textContent =
    "BLU INTELLIGENCE / " +
    [
      "CADA VIAGEM COMEÇA COM ALGUÉM",
      "CONHECIMENTO QUE ORIENTA",
      "CURADORIA EM MOVIMENTO",
    ][state.scene];
  $("#intro").textContent = [
    "Antes de escolher um lugar, precisamos de conhecer as pessoas. Vamos começar por uma decisão sua.",
    "Cada ponto é uma possibilidade. Explore o mapa e descubra o contexto por trás da escolha.",
    "O pedido e o interesse escolhido encontram-se num roteiro. Agora, veja o que muda quando o cliente muda de ideias.",
  ][state.scene];
  $(".show-chapters").innerHTML = chapters
    .map(
      (label, index) =>
        `<button type="button" data-scene="${index}" ${state.scene === index ? 'aria-current="step"' : ""}><span>0${index + 1}</span>${label}<i aria-hidden="true"></i></button>`,
    )
    .join("");
  $("#scene").className = `show-scene show-scene-${state.scene}`;
  $("#scene").innerHTML = [requestScene, mapScene, itineraryScene][
    state.scene
  ]();
  $("#counter").textContent = `0${state.scene + 1} / 03`;
  $("#conclusion").textContent = [
    "Primeiro as pessoas. Depois os lugares.",
    "Uma escolha ganha valor quando tem contexto.",
    "Uma proposta para rever, adaptar e entregar.",
  ][state.scene];
  $("#previous").disabled = state.scene === 0;
  $("#next").innerHTML = [
    'Explorar o território <span aria-hidden="true">→</span>',
    'Dar forma à viagem <span aria-hidden="true">→</span>',
    '<span aria-hidden="true">↺</span> Recomeçar',
  ][state.scene];
  document.title = `BLU — ${chapters[state.scene]}`;
  if (focus) {
    $("#show-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
function go(scene) {
  state.scene = Math.max(0, Math.min(2, scene));
  render();
}
$("#next").addEventListener("click", () => {
  if (state.scene === 2) {
    Object.assign(state, {
      scene: 0,
      preference: "culture",
      selected: 0,
      free: false,
    });
    render();
  } else go(state.scene + 1);
});
$("#previous").addEventListener("click", () => go(state.scene - 1));
$(".show-chapters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene]");
  if (button) go(Number(button.dataset.scene));
});
$("#scene").addEventListener("click", (event) => {
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
render(false);
