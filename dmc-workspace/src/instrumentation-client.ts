import { portalUrl } from "./lib/http-client";

const endpoint = portalUrl("/api/telemetry");
const nativeFetch = window.fetch.bind(window);
const recent = new Map<string, number>();

function sessionUser() {
  try {
    let value = sessionStorage.getItem("blu-observability-session");
    if (!value) {
      value = crypto.randomUUID().slice(0, 8);
      sessionStorage.setItem("blu-observability-session", value);
    }
    return `sessao:${value}`;
  } catch {
    return "sessao:nao-identificada";
  }
}

function moduleFrom(value: string) {
  try {
    const parts = new URL(value, location.href).pathname.split("/").filter(Boolean);
    return parts[0] === "api" ? `api:${parts[1] ?? "root"}` : (parts[0] ?? "início");
  } catch {
    return "portal";
  }
}

function report(event: Record<string, unknown>) {
  const key = `${event.operation}:${event.module}:${event.outcome}:${event.details ?? ""}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < 750) return;
  recent.set(key, now);
  if (recent.size > 100)
    for (const [candidate, at] of recent) if (now - at > 60_000) recent.delete(candidate);
  nativeFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ component: "portal", user: sessionUser(), ...event }),
    keepalive: true,
  }).catch(() => undefined);
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url, location.href).pathname.endsWith(endpoint)) return nativeFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const started = performance.now();
  try {
    const response = await nativeFetch(input, init);
    if (
      new URL(url, location.href).origin === location.origin &&
      new URL(url, location.href).pathname.includes("/api/")
    )
      report({
        operation: "api_request",
        module: moduleFrom(url),
        outcome: response.ok ? "success" : "failed",
        level: response.ok ? "info" : response.status >= 500 ? "error" : "warning",
        details: `${method} ${new URL(url, location.href).pathname}`,
        httpStatus: response.status,
        durationMs: performance.now() - started,
      });
    return response;
  } catch (error) {
    report({
      operation: "api_request",
      module: moduleFrom(url),
      outcome: "failed",
      level: "error",
      details: `${method} ${new URL(url, location.href).pathname}`,
      message: error instanceof Error ? error.message : "Falha de rede",
      durationMs: performance.now() - started,
    });
    throw error;
  }
};

document.addEventListener(
  "click",
  (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("button,a,[role='button']") : null;
    if (!target) return;
    const kind =
      target instanceof HTMLAnchorElement
        ? "link"
        : (target.getAttribute("role") ?? target.tagName.toLowerCase());
    const identity =
      target.id || target.getAttribute("data-observability") || target.getAttribute("type") || kind;
    report({
      operation: "interaction",
      module: moduleFrom(location.href),
      outcome: "success",
      level: "info",
      details: `${kind}:${identity}`,
    });
  },
  { capture: true },
);

window.addEventListener("error", (event) =>
  report({
    operation: "unhandled_error",
    module: moduleFrom(location.href),
    outcome: "failed",
    level: "error",
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  }),
);
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason instanceof Error ? event.reason : null;
  report({
    operation: "unhandled_rejection",
    module: moduleFrom(location.href),
    outcome: "failed",
    level: "critical",
    message: error?.message ?? "Promise rejeitada",
    stack: error?.stack,
  });
});
report({
  operation: "page_view",
  module: moduleFrom(location.href),
  outcome: "success",
  level: "info",
  details: location.pathname,
});

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  report({
    operation: "navigation",
    module: moduleFrom(url),
    outcome: "success",
    level: "info",
    details: navigationType,
  });
}
