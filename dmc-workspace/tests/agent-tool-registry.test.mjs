import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_TOOLS, authorizeAgentTool } from "../src/lib/agent-tool-registry.ts";

const principal = (role, permissions) => ({ id: `cognito:${role}`, role, permissions });

test("superfície aprovada separa leitura, proposta e escrita", () => {
  assert.deepEqual(Object.keys(AGENT_TOOLS).sort(), [
    "catalog.read",
    "itinerary.accept",
    "itinerary.propose",
    "itinerary.read",
    "itinerary.reject",
    "itinerary.select_alternative",
  ]);
  assert.equal(AGENT_TOOLS["itinerary.read"].confirmation, "none");
  assert.equal(AGENT_TOOLS["itinerary.propose"].confirmation, "preview");
  assert.equal(AGENT_TOOLS["itinerary.accept"].confirmation, "explicit");
  for (const tool of Object.values(AGENT_TOOLS)) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(Array.isArray(tool.inputSchema.required));
  }
});

test("viewer só lê e curator propõe mas não escreve sem confirmação", () => {
  const viewer = principal("viewer", ["trip.read", "catalog.read"]);
  assert.doesNotThrow(() => authorizeAgentTool(viewer, "itinerary.read"));
  assert.throws(() => authorizeAgentTool(viewer, "itinerary.propose"), /Permissão/);
  const curator = principal("curator", [
    "trip.read",
    "catalog.read",
    "agent.propose",
    "agent.approve",
  ]);
  assert.doesNotThrow(() => authorizeAgentTool(curator, "itinerary.propose"));
  assert.throws(() => authorizeAgentTool(curator, "itinerary.accept"), /confirmação/);
  assert.doesNotThrow(() => authorizeAgentTool(curator, "itinerary.accept", true));
});
