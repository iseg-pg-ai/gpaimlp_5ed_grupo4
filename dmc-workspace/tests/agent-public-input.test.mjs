import assert from "node:assert/strict";
import test from "node:test";

import { publicAgentConversation, publicAgentText } from "../src/lib/agent-public-input.ts";

test("contactos escritos no chat não seguem para o fornecedor", () => {
  const input = "Partilha com cliente@example.com ou +351 912 345 678, em inglês.";
  const safe = publicAgentText(input);
  assert.doesNotMatch(safe, /cliente@|912 345/);
  assert.match(safe, /Partilha com/);
  const turns = publicAgentConversation([{ sender: "user", text: input }]);
  assert.doesNotMatch(JSON.stringify(turns), /example\.com|912 345/);
});
