const $ = (id) => document.getElementById(id);
const labels = { up: "Disponível", down: "Indisponível", degraded: "Degradado", unknown: "Por verificar", disabled: "Desativado" };
const names = { "Portal BLU": "01 / CURADORIA", "Observatório analítico": "02 / ANÁLISE", "Apresentação": "03 / EXPERIÊNCIA", "Agente IA": "04 / ASSISTÊNCIA OPCIONAL" };
const date = (value) => value ? new Date(value).toLocaleString("pt-PT") : "Por verificar";
const text = (id, value) => { $(id).textContent = value; };
function node(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}
function render(data) {
  const s = data.snapshot;
  if (!s) { text("sync-label", "Primeira recolha em curso"); return; }
  const stale = Date.now() - new Date(s.checked_at).getTime() > s.interval_seconds * 2500;
  text("sync-label", stale ? "Recolha atrasada" : "Recolha ativa");
  $("live-indicator").classList.toggle("warning", stale);
  text("checked-at", `${date(s.checked_at)} · intervalo ${s.interval_seconds}s`);
  const active = s.services.filter((service) => service.state !== "disabled");
  text("service-count", `${active.filter((service) => service.state === "up").length} / ${active.length}`);
  text("service-note", "Serviços ativos a responder");
  text("etl-state", s.warehouse.validation === "passed" ? "Validada" : labels[s.warehouse.state]);
  text("etl-note", s.warehouse.freshness === "not_configured" ? "Cadência de atualização por definir" : `Atualidade: ${s.warehouse.freshness === "fresh" ? "dentro da cadência" : "por rever"}`);
  text("disk-free", `${s.system.disk_free_gb} GB`);
  text("disk-note", `${s.system.disk_used_pct}% do disco ocupado`);
  const incidentCount = active.filter((service) => service.state !== "up").length + (s.warehouse.state !== "up" ? 1 : 0) + (s.system.disk_used_pct >= 90 ? 1 : 0) + (stale ? 1 : 0);
  text("incident-count", incidentCount);
  $("services").replaceChildren(...s.services.map((service) => {
    const card = node("article", `service-card ${service.state}`);
    const top = node("div", "service-top");
    top.append(node("span", "eyebrow", names[service.name]), node("span", `status-dot ${service.state}`));
    card.append(top, node("h3", "", service.name));
    const bottom = node("div", "service-bottom");
    bottom.append(node("span", `badge ${service.state}`, labels[service.state]), node("strong", "latency", service.latency_ms === null ? "—" : `${service.latency_ms} ms`));
    card.append(bottom, node("p", "footnote", service.state === "disabled" ? "Sem sondas nem chamadas a modelos" : service.http_status ? `HTTP ${service.http_status} · resposta da sonda` : "Falha na sonda HTTP"));
    return card;
  }));
  text("published-at", date(s.warehouse.published_at));
  text("warehouse-age", s.warehouse.age_hours === null ? "Por verificar" : `${s.warehouse.age_hours} horas`);
  text("validation", { passed: "Aprovada", failed: "Falhou", unknown: "Por verificar" }[s.warehouse.validation]);
  text("table-count", s.warehouse.tables === null ? "Por verificar" : `${s.warehouse.tables} / ${s.warehouse.records.toLocaleString("pt-PT")}`);
  text("freshness", { not_configured: "Cadência por definir", fresh: "Dentro da cadência", stale: "Fora da cadência", unknown: "Por verificar" }[s.warehouse.freshness]);
  text("warehouse-badge", labels[s.warehouse.state]);
  $("warehouse-badge").className = `badge ${s.warehouse.state}`;
  text("host-load", `Carga média do anfitrião (1 min): ${s.system.load_1m ?? "indisponível"}. Não é percentagem de CPU.`);
  $("events").replaceChildren(...data.events.map((event) => {
    const row = node("div", "event");
    row.append(node("span", `status-dot ${event.state}`), node("strong", "", event.component), node("span", "event-state", labels[event.state]), node("time", "", date(event.at)));
    return row;
  }));
  const history = data.history;
  const values = history.map((sample) => {
    const portal = sample.services.find((service) => service.name === "Portal BLU");
    return portal?.state === "up" ? portal.latency_ms : null;
  });
  const max = Math.max(1, ...values.filter((v) => v !== null));
  const bars = values.map((value) => {
    const bar = node("span", value === null ? "bar failed" : "bar");
    bar.style.height = value === null ? "5%" : `${Math.max(3, value / max * 90)}%`;
    bar.title = value === null ? "Sem medição" : `${value} ms`;
    return bar;
  });
  // A altura variável usa uma propriedade CSS; o CSP não autoriza estilos HTML inline.
  $("chart").replaceChildren(...bars);
  $("chart").setAttribute("aria-label", `${values.length} amostras de latência do portal; máximo ${max} milissegundos`);
  text("history-window", `${history.length} / 240 amostras`);
  text("chart-start", history.length ? date(history[0].at) : "—");
  text("chart-end", history.length ? date(history.at(-1).at) : "—");
}
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  try {
    const response = await fetch("api/status", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401) { location.href = "login"; return; }
    if (!response.ok) throw new Error("status");
    render(await response.json());
    $("connection-error").hidden = true;
  } catch {
    text("sync-label", "Ligação interrompida");
    text("connection-error", "Não foi possível atualizar. Os valores apresentados são da última recolha recebida.");
    $("connection-error").hidden = false;
    $("live-indicator").classList.add("warning");
  } finally {
    busy = false;
    $("refresh").disabled = false;
  }
}
$("refresh").addEventListener("click", refresh);
refresh();
setInterval(refresh, 15000);
