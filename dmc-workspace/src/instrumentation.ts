import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/operational-telemetry");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordOperationalEvent } = await import("./lib/operational-telemetry");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : "UNHANDLED_SERVER_ERROR";
  await recordOperationalEvent({
    component: "portal",
    operation: context.routePath,
    module: context.routeType,
    user: "server",
    outcome: "failed",
    level: "error",
    errorCode: digest,
    message: error instanceof Error ? error.message : "Erro não tratado no servidor",
    stack: error instanceof Error ? error.stack : undefined,
  });
};
