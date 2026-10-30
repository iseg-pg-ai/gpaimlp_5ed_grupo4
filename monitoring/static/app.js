// Atualiza o painel a partir das APIs autenticadas e apresenta incidentes, serviços e
// detalhe dos eventos.
const $ = (id) => document.getElementById(id);
const labels = {
  up: "Disponível",
  down: "Indisponível",
  degraded: "Degradado",
  unknown: "Por verificar",
  disabled: "Desativado",
};
const names = {
  "Portal BLU": "01 / CURADORIA",
  "Observatório analítico": "02 / ANÁLISE",
  Apresentação: "03 / EXPERIÊNCIA",
  "Agente IA": "04 / ASSISTÊNCIA OPCIONAL",
};
const date = (value) =>
  value ? new Date(value).toLocaleString("pt-PT") : "Por verificar";
const text = (id, value) => {
  $(id).textContent = value;
};
function node(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}
const operationNames = {
  portal: ["Registos do portal", "Pedidos e operações das últimas 24 horas."],
  ai: [
    "Registos da assistência IA",
    "Chamadas, latência e contadores reportados nas últimas 24 horas.",
  ],
  backup: [
    "Cópias e restauros",
    "Última cópia automática e último ensaio de restauro.",
  ],
  alerts: [
    "Histórico de incidentes",
    "Aberturas e recuperações registadas na fila local.",
  ],
};
const fieldNames = {
  component: "Componente",
  operation: "Operação",
  outcome: "Resultado",
  level: "Nível",
  duration_ms: "Duração",
  error_code: "Código de erro",
  http_status: "HTTP",
  input_tokens: "Tokens de entrada",
  output_tokens: "Tokens de saída",
  total_tokens: "Tokens totais",
  backup_id: "Cópia",
  backup_created_at: "Data da cópia",
  artifact_count: "Artefactos",
  key: "Incidente",
  event: "Alteração",
};
function formatField(key, value) {
  if (key === "duration_ms") return `${value} ms`;
  if (key === "backup_created_at") return date(value);
  return String(value);
}
let operationEntries = [];
function renderOperationEntries(errorsOnly = false) {
  const visible = errorsOnly
    ? operationEntries.filter((entry) => entry.is_error)
    : operationEntries;
  $("logs-all").classList.toggle("active", !errorsOnly);
  $("logs-errors").classList.toggle("active", errorsOnly);
  $("logs-all").setAttribute("aria-pressed", String(!errorsOnly));
  $("logs-errors").setAttribute("aria-pressed", String(errorsOnly));
  text("logs-all-count", operationEntries.length);
  text(
    "logs-error-count",
    operationEntries.filter((entry) => entry.is_error).length,
  );
  const entries = visible.map((entry) => {
    const row = node("article", `log-entry${entry.is_error ? " error" : ""}`);
    row.append(node("time", "", date(entry.at)));
    const details = node("dl", "");
    Object.entries(entry.fields).forEach(([key, value]) => {
      const item = node("div", "");
      item.append(
        node("dt", "", fieldNames[key] ?? key),
        node("dd", "", formatField(key, value)),
      );
      details.append(item);
    });
    row.append(details);
    return row;
  });
  $("operations-logs").replaceChildren(
    ...(entries.length
      ? entries
      : [
          node(
            "p",
            "muted",
            errorsOnly
              ? "Não existem erros neste período."
              : "Ainda não existem registos para este sinal.",
          ),
        ]),
  );
}
async function openOperations(kind) {
  const dialog = $("operations-dialog");
  const [title, description] = operationNames[kind];
  text("operations-title", title);
  text("operations-description", description);
  operationEntries = [];
  text("logs-all-count", "0");
  text("logs-error-count", "0");
  $("logs-all").classList.add("active");
  $("logs-errors").classList.remove("active");
  $("logs-all").setAttribute("aria-pressed", "true");
  $("logs-errors").setAttribute("aria-pressed", "false");
  $("operations-logs").replaceChildren(
    node("p", "muted", "A carregar registos…"),
  );
  dialog.showModal();
  try {
    const response = await fetch(
      `api/operations?kind=${encodeURIComponent(kind)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 401) {
      location.href = "login";
      return;
    }
    if (!response.ok) throw new Error("operations");
    operationEntries = (await response.json()).entries;
    renderOperationEntries();
  } catch {
    $("operations-logs").replaceChildren(
      node(
        "p",
        "connection-error",
        "Não foi possível carregar os registos técnicos.",
      ),
    );
  }
}
function render(data) {
  const s = data.snapshot;
  if (!s) {
    text("sync-label", "Primeira recolha em curso");
    return;
  }
  const stale =
    Date.now() - new Date(s.checked_at).getTime() > s.interval_seconds * 2500;
  text("sync-label", stale ? "Recolha atrasada" : "Recolha ativa");
  $("live-indicator").classList.toggle("warning", stale);
  text(
    "checked-at",
    `${date(s.checked_at)} · intervalo ${s.interval_seconds}s`,
  );
  const active = s.services.filter((service) => service.state !== "disabled");
  text(
    "service-count",
    `${active.filter((service) => service.state === "up").length} / ${active.length}`,
  );
  text("service-note", "Serviços ativos a responder");
  text(
    "etl-state",
    s.warehouse.validation === "passed"
      ? "Validada"
      : labels[s.warehouse.state],
  );
  text(
    "etl-note",
    s.warehouse.freshness === "not_configured"
      ? "Cadência de atualização por definir"
      : `Atualidade: ${s.warehouse.freshness === "fresh" ? "dentro da cadência" : "por rever"}`,
  );
  text("disk-free", `${s.system.disk_free_gb} GB`);
  text("disk-note", `${s.system.disk_used_pct}% do disco ocupado`);
  const cleanup = s.system.cleanup;
  if (cleanup) {
    const freed =
      cleanup.freed_bytes >= 1048576
        ? `${(cleanup.freed_bytes / 1048576).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB libertados`
        : `${cleanup.freed_bytes.toLocaleString("pt-PT")} bytes libertados`;
    text(
      "cleanup-note",
      cleanup.last_run_at
        ? `Última limpeza: ${freed} · ${date(cleanup.last_run_at)}`
        : `Limpeza automática aos ${cleanup.trigger_disk_pct}%`,
    );
  }
  const incidentCount =
    s.alerts?.active ??
    active.filter((service) => service.state !== "up").length +
      (s.warehouse.state !== "up" ? 1 : 0) +
      (s.system.disk_used_pct >= 90 ? 1 : 0) +
      (stale ? 1 : 0);
  text("incident-count", incidentCount);
  $("services").replaceChildren(
    ...s.services.map((service) => {
      const card = node("article", `service-card ${service.state}`);
      const top = node("div", "service-top");
      top.append(
        node("span", "eyebrow", names[service.name]),
        node("span", `status-dot ${service.state}`),
      );
      card.append(top, node("h3", "", service.name));
      const bottom = node("div", "service-bottom");
      bottom.append(
        node("span", `badge ${service.state}`, labels[service.state]),
        node(
          "strong",
          "latency",
          service.latency_ms === null ? "—" : `${service.latency_ms} ms`,
        ),
      );
      card.append(
        bottom,
        node(
          "p",
          "footnote",
          service.state === "disabled"
            ? "Sem sondas nem chamadas a modelos"
            : service.http_status
              ? `HTTP ${service.http_status} · resposta da sonda`
              : "Falha na sonda HTTP",
        ),
      );
      return card;
    }),
  );
  text("published-at", date(s.warehouse.published_at));
  text(
    "warehouse-age",
    s.warehouse.age_hours === null
      ? "Por verificar"
      : `${s.warehouse.age_hours} horas`,
  );
  text(
    "validation",
    { passed: "Aprovada", failed: "Falhou", unknown: "Por verificar" }[
      s.warehouse.validation
    ],
  );
  text(
    "table-count",
    s.warehouse.tables === null
      ? "Por verificar"
      : `${s.warehouse.tables} / ${s.warehouse.records.toLocaleString("pt-PT")}`,
  );
  text(
    "freshness",
    {
      not_configured: "Cadência por definir",
      fresh: "Dentro da cadência",
      stale: "Fora da cadência",
      unknown: "Por verificar",
    }[s.warehouse.freshness],
  );
  text("warehouse-badge", labels[s.warehouse.state]);
  $("warehouse-badge").className = `badge ${s.warehouse.state}`;
  text(
    "host-load",
    `Carga do anfitrião · média 1 min: ${s.system.load_1m ?? "indisponível"}`,
  );
  const ops = s.operations;
  if (ops) {
    const setSignal = (id, state, label) => {
      $(id).className = `signal-card ${state}`;
      text(`${id}-state`, label);
    };
    const portalState = ops.portal.errors_24h ? "degraded" : "up";
    const aiState = ops.ai.failures_24h ? "degraded" : "up";
    const alertState = s.alerts.active ? "degraded" : "up";
    setSignal(
      "portal-signal",
      portalState,
      portalState === "up" ? "Estável" : "Atenção",
    );
    setSignal(
      "ai-signal",
      aiState,
      ops.ai.calls_24h
        ? aiState === "up"
          ? "Estável"
          : "Atenção"
        : "Sem atividade",
    );
    setSignal(
      "backup-signal",
      ops.backup.state,
      ops.backup.state === "up" ? "Verificado" : "Por verificar",
    );
    setSignal(
      "alert-signal",
      alertState,
      alertState === "up" ? "Sem incidentes" : "Requer atenção",
    );
    text("portal-ops", ops.portal.errors_24h.toLocaleString("pt-PT"));
    text(
      "portal-ops-note",
      `${ops.portal.events_24h.toLocaleString("pt-PT")} eventos · ${ops.portal.errors_24h} com erro`,
    );
    text("ai-ops", ops.ai.calls_24h.toLocaleString("pt-PT"));
    text(
      "ai-tokens",
      ops.ai.calls_with_tokens
        ? `${ops.ai.tokens_reported.toLocaleString("pt-PT")} tokens reportados`
        : `${ops.ai.failures_24h} falhas · tokens ainda sem dados`,
    );
    const agent = ops.agent_metrics;
    if (agent) {
      text("agent-proposals", agent.state === "up" ? agent.proposals.toLocaleString("pt-PT") : "—");
      text("agent-decisions", agent.state === "up" ? `${agent.accepted} / ${agent.rejected}` : "—");
      text("agent-conflicts", agent.conflicts_24h.toLocaleString("pt-PT"));
      text("agent-expired", agent.state === "up" ? agent.expired.toLocaleString("pt-PT") : "—");
      text(
        "agent-tokens",
        agent.state === "up"
          ? `${agent.input_tokens.toLocaleString("pt-PT")} / ${agent.output_tokens.toLocaleString("pt-PT")}`
          : "—",
      );
      text("agent-latency", agent.average_latency_ms === null ? "—" : `${agent.average_latency_ms} ms`);
      text("agent-cost", agent.cost_state === "configured" ? `$${agent.cost_usd.toFixed(4)}` : "Por configurar");
    }
    text(
      "backup-artifacts",
      ops.backup.artifacts === null
        ? "—"
        : ops.backup.artifacts.toLocaleString("pt-PT"),
    );
    text(
      "backup-restore",
      [
        ops.backup.last_restore_at
          ? `Restauro · ${date(ops.backup.last_restore_at)}`
          : "Restauro por ensaiar",
        `S3 · ${ops.backup.s3_state === "passed" ? "verificado" : ops.backup.s3_state === "failed" ? "falhou" : "não configurado"}`,
        `Dados S3 · ${ops.backup.data_s3_state === "passed" ? "verificados" : ops.backup.data_s3_state === "failed" ? "falharam" : "sem publicação"}`,
        `${ops.persistence?.pending_total ?? 0} operações pendentes`,
        `SQL · ${ops.persistence?.state === "up" ? "disponível" : "degradado"}`,
      ].join(" · "),
    );
    text("alert-state", s.alerts.active.toLocaleString("pt-PT"));
    text(
      "alert-delivery",
      (s.alerts.external ?? "disabled") === "disabled"
        ? "Fila local · envio externo desativado"
        : `SNS · ${s.alerts.external_delivered} entregues · ${s.alerts.external_pending} pendentes`,
    );
    const health = s.alerts.active ? "degraded" : "up";
    text(
      "ops-health",
      s.alerts.active ? `${s.alerts.active} por analisar` : "Operação estável",
    );
    $("ops-health").className = `badge ${health}`;
  }
  $("events").replaceChildren(
    ...data.events.map((event) => {
      const row = node("div", "event");
      row.append(
        node("span", `status-dot ${event.state}`),
        node("strong", "", event.component),
        node("span", "event-state", labels[event.state]),
        node("time", "", date(event.at)),
      );
      return row;
    }),
  );
  const history = data.history;
  const values = history.map((sample) => {
    const portal = sample.services.find(
      (service) => service.name === "Portal BLU",
    );
    return portal?.state === "up" ? portal.latency_ms : null;
  });
  const max = Math.max(1, ...values.filter((v) => v !== null));
  const bars = values.map((value) => {
    const bar = node("span", value === null ? "bar failed" : "bar");
    bar.style.height =
      value === null ? "5%" : `${Math.max(3, (value / max) * 90)}%`;
    bar.title = value === null ? "Sem medição" : `${value} ms`;
    return bar;
  });
  // A altura variável usa uma propriedade CSS; o CSP não autoriza estilos HTML inline.
  $("chart").replaceChildren(...bars);
  $("chart").setAttribute(
    "aria-label",
    `${values.length} amostras de latência do portal; máximo ${max} milissegundos`,
  );
  text("history-window", `${history.length} / 240 amostras`);
  text("chart-start", history.length ? date(history[0].at) : "—");
  text("chart-end", history.length ? date(history.at(-1).at) : "—");
}
const logTables = [];
const logDetailNames = {
  timestamp: "Data e hora", user: "Utilizador", action: "Ação", module: "Módulo",
  status: "Estado", severity: "Severidade", details: "Detalhes", message: "Mensagem",
  http_status: "Código HTTP", duration_ms: "Duração", error_code: "Código do erro",
  component: "Componente",
};
function showLogDetail(entry) {
  $("log-detail-title").textContent = entry.action || "Detalhes do evento";
  const summary = $("log-detail-summary");
  summary.replaceChildren(
    node("span", `severity ${entry.severity}`, entry.severity),
    node("strong", "", entry.status),
    node("time", "", date(entry.timestamp)),
  );
  const fields = Object.entries(entry)
    .filter(([key, value]) => key !== "stack" && value !== null && value !== undefined)
    .map(([key, value]) => {
      const item = node("div", "");
      item.append(node("dt", "", logDetailNames[key] ?? key), node("dd", "", key === "timestamp" ? date(value) : key === "duration_ms" ? `${value} ms` : value));
      return item;
    });
  $("log-detail-fields").replaceChildren(...fields);
  const stack = $("log-detail-stack");
  stack.hidden = !entry.stack;
  stack.querySelector("pre").textContent = entry.stack ?? "";
  $("log-detail-dialog").showModal();
}
function renderLogTable(table) {
  const entries = table.entries;
  table.summary.textContent = `${entries.length.toLocaleString("pt-PT")} de ${table.total.toLocaleString("pt-PT")} eventos · atualização automática`;
  if (!entries.length) {
    table.results.replaceChildren(node("p", "log-empty", "Não existem eventos para estes filtros."));
    return;
  }
  const compact = !table.portal;
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  (compact ? ["Data", "Estado", "Duração"] : ["Data", "Severidade", "Utilizador", "Ação", "Módulo", "Estado", "Detalhes"])
    .forEach((label) => heading.append(node("th", "", label)));
  head.append(heading);
  const body = document.createElement("tbody");
  entries.forEach((entry) => {
    const row = document.createElement("tr");
    row.dataset.severity = entry.severity;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Consultar ${entry.action}, ${entry.severity}, ${date(entry.timestamp)}`);
    row.addEventListener("click", () => showLogDetail(entry));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showLogDetail(entry);
      }
    });
    const action = node("span", "log-action", entry.action);
    const actionCell = document.createElement("td");
    actionCell.append(action);
    if (compact) {
      const state = document.createElement("td");
      state.append(node("span", `severity ${entry.severity}`, entry.status));
      row.append(node("td", "", date(entry.timestamp)), state,
        node("td", "", entry.duration_ms == null ? "—" : `${entry.duration_ms} ms`));
      body.append(row);
      return;
    }
    [date(entry.timestamp), null, entry.user, null, entry.module, entry.status, entry.details].forEach((value, index) => {
      if (index === 1) {
        const cell = document.createElement("td");
        cell.append(node("span", `severity ${entry.severity}`, entry.severity));
        row.append(cell);
      } else if (index === 3) row.append(actionCell);
      else row.append(node("td", "", value));
    });
    body.append(row);
  });
  const element = node("table", "log-table");
  element.append(head, body);
  table.results.replaceChildren(element);
}
async function refreshLogTable(table) {
  if (table.busy) return;
  table.busy = true;
  const source = table.panel.dataset.module;
  const query = new URLSearchParams({ module: source, severity: table.severity.value, search: table.search?.value.trim() ?? "", order: table.order?.dataset.order ?? "desc", limit: "200" });
  try {
    const response = await fetch(`api/logs?${query}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401) { location.href = "login"; return; }
    if (!response.ok) throw new Error("logs");
    const payload = await response.json();
    table.entries = payload.entries;
    table.total = payload.total;
    if (table.panel.querySelector("[data-log-count]")) {
      table.panel.querySelectorAll("[data-log-count]").forEach((count) => {
        count.textContent = (payload.counts?.[count.dataset.logCount] ?? 0).toLocaleString("pt-PT");
      });
    }
    renderLogTable(table);
  } catch {
    table.results.replaceChildren(node("p", "log-failure", "Não foi possível carregar os registos persistentes."));
  } finally {
    table.busy = false;
  }
}
document.querySelectorAll("[data-log-table]").forEach((panel) => {
  const table = {
    panel, portal: panel.classList.contains("portal-logs"), entries: [], total: 0, busy: false,
    module: panel.querySelector("[data-log-module]"), severity: panel.querySelector("[data-log-severity]"),
    search: panel.querySelector("[data-log-search]"), order: panel.querySelector("[data-log-order]"),
    results: panel.querySelector("[data-log-results]"), summary: panel.querySelector("[data-log-summary]"),
  };
  let timer;
  table.search?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => refreshLogTable(table), 300); });
  table.severity.addEventListener("change", () => refreshLogTable(table));
  table.panel.querySelectorAll("[data-log-mode]").forEach((button) => button.addEventListener("click", () => {
    table.severity.value = button.dataset.logMode;
    table.panel.querySelectorAll("[data-log-mode]").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", String(active));
    });
    refreshLogTable(table);
  }));
  table.module?.addEventListener("change", () => refreshLogTable(table));
  table.order?.addEventListener("click", () => {
    const desc = table.order.dataset.order === "desc";
    table.order.dataset.order = desc ? "asc" : "desc";
    table.order.textContent = desc ? "Mais antigos ↑" : "Mais recentes ↓";
    refreshLogTable(table);
  });
  logTables.push(table);
  refreshLogTable(table);
});
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  try {
    const response = await fetch("api/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) {
      location.href = "login";
      return;
    }
    if (!response.ok) throw new Error("status");
    render(await response.json());
    $("connection-error").hidden = true;
  } catch {
    text("sync-label", "Ligação interrompida");
    text(
      "connection-error",
      "Não foi possível atualizar. Os valores apresentados são da última recolha recebida.",
    );
    $("connection-error").hidden = false;
    $("live-indicator").classList.add("warning");
  } finally {
    busy = false;
    $("refresh").disabled = false;
  }
}
$("refresh").addEventListener("click", refresh);
document.querySelectorAll("[data-signal]").forEach((card) => {
  card.addEventListener("click", () => openOperations(card.dataset.signal));
});
$("operations-close").addEventListener("click", () =>
  $("operations-dialog").close(),
);
$("logs-all").addEventListener("click", () => renderOperationEntries());
$("logs-errors").addEventListener("click", () => renderOperationEntries(true));
$("operations-dialog").addEventListener("click", (event) => {
  if (event.target === $("operations-dialog")) $("operations-dialog").close();
});
document.querySelector("[data-log-detail-close]").addEventListener("click", () => $("log-detail-dialog").close());
$("log-detail-dialog").addEventListener("click", (event) => {
  if (event.target === $("log-detail-dialog")) $("log-detail-dialog").close();
});
refresh();
setInterval(refresh, 15000);
setInterval(() => logTables.forEach(refreshLogTable), 15000);
