import { type AuthenticatedPrincipal, requirePermission } from "./server-principal.ts";

export type AgentToolName =
  | "itinerary.read"
  | "catalog.read"
  | "itinerary.propose"
  | "itinerary.accept"
  | "itinerary.reject"
  | "itinerary.select_alternative";

type ToolDescriptor = {
  mode: "read" | "proposal" | "write";
  permission: string;
  confirmation: "none" | "preview" | "explicit";
  inputSchema: Record<string, unknown>;
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const trip = { type: "string", pattern: "^[A-Za-z0-9_-]{1,120}$" };
const version = { type: "integer", minimum: 1 };
const run = { type: "string", minLength: 1, maxLength: 80 };

/** Superfície fechada do agente; ausência desta lista significa capacidade negada. */
export const AGENT_TOOLS = Object.freeze<Record<AgentToolName, ToolDescriptor>>({
  "itinerary.read": {
    mode: "read",
    permission: "trip.read",
    confirmation: "none",
    inputSchema: objectSchema({ tripId: trip, version }, ["tripId", "version"]),
  },
  "catalog.read": {
    mode: "read",
    permission: "catalog.read",
    confirmation: "none",
    inputSchema: objectSchema({}, []),
  },
  "itinerary.propose": {
    mode: "proposal",
    permission: "agent.propose",
    confirmation: "preview",
    inputSchema: objectSchema(
      {
        tripId: trip,
        baseVersion: version,
        instruction: { type: "string", minLength: 1, maxLength: 4000 },
      },
      ["tripId", "baseVersion", "instruction"],
    ),
  },
  "itinerary.accept": {
    mode: "write",
    permission: "agent.approve",
    confirmation: "explicit",
    inputSchema: objectSchema({ tripId: trip, baseVersion: version, runId: run }, [
      "tripId",
      "baseVersion",
      "runId",
    ]),
  },
  "itinerary.reject": {
    mode: "write",
    permission: "agent.approve",
    confirmation: "explicit",
    inputSchema: objectSchema(
      {
        tripId: trip,
        baseVersion: version,
        runId: run,
        reason: { type: "string", maxLength: 1000 },
      },
      ["tripId", "baseVersion", "runId"],
    ),
  },
  "itinerary.select_alternative": {
    mode: "write",
    permission: "agent.approve",
    confirmation: "explicit",
    inputSchema: objectSchema(
      {
        tripId: trip,
        baseVersion: version,
        runId: run,
        dayNumber: { type: "integer", minimum: 1, maximum: 366 },
        itemId: { type: "string", minLength: 1, maxLength: 300 },
        catalogId: { type: "string", minLength: 1, maxLength: 300 },
      },
      ["tripId", "baseVersion", "runId", "dayNumber", "itemId", "catalogId"],
    ),
  },
});

export function authorizeAgentTool(
  principal: AuthenticatedPrincipal,
  name: AgentToolName,
  explicitlyConfirmed = false,
) {
  const tool = AGENT_TOOLS[name];
  requirePermission(principal, tool.permission);
  if (tool.confirmation === "explicit" && !explicitlyConfirmed)
    throw new Error("A ferramenta exige confirmação explícita.");
  return tool;
}
