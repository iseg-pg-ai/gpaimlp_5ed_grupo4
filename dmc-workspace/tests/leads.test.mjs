import assert from "node:assert/strict";
import test from "node:test";
import {
  contactDetails,
  isOverdue,
  toLead,
  toMessage,
  validLeadId,
} from "../src/lib/leads-model.ts";

test("perfil DynamoDB converte-se num contacto com estado e contagem", () => {
  const lead = toLead({
    conversationId: { S: "BLU-AC2EE15506850505" },
    recordKey: { S: "PROFILE" },
    followUpStatus: { S: "PENDING" },
    followUpAt: { S: "2026-10-28T14:04:47.699Z" },
    lastActivityAt: { S: "2026-10-25T14:04:47.699Z" },
    lastChannel: { S: "website" },
    messageCount: { N: "6" },
    synthetic: { BOOL: false },
  });
  assert.deepEqual(lead, {
    id: "BLU-AC2EE15506850505",
    status: "PENDING",
    followUpAt: "2026-10-28T14:04:47.699Z",
    lastActivityAt: "2026-10-25T14:04:47.699Z",
    channel: "website",
    messageCount: 6,
    synthetic: false,
  });
  assert.equal(isOverdue(lead, new Date("2026-10-27T00:00:00Z")), false);
  assert.equal(isOverdue(lead, new Date("2026-10-29T00:00:00Z")), true);
  assert.equal(
    isOverdue({ ...lead, status: "CONTACTED" }, new Date("2026-11-30T00:00:00Z")),
    false,
  );
});

test("mensagem usa a data da chave de ordenação e o tipo por defeito", () => {
  assert.deepEqual(
    toMessage({
      occurredAtId: { S: "2026-10-25T14:04:47.100Z#abc" },
      actor: { S: "customer" },
      channel: { S: "whatsapp" },
      text: { S: "Olá" },
    }),
    {
      at: "2026-10-25T14:04:47.100Z",
      actor: "customer",
      channel: "whatsapp",
      eventType: "conversation.message.recorded",
      text: "Olá",
    },
  );
});

test("contactos vêm só do cliente, sem duplicados nem números curtos", () => {
  const message = (actor, text) => ({ at: "", actor, channel: "website", eventType: "", text });
  const found = contactDetails([
    message("assistant", "Write to hello@blucostatravel.com or call +351 210 000 000"),
    message("customer", "you can email me at test@example.com, or test@example.com"),
    message("customer", "phone +351 912 345 678; budget 6000 EUR for 2 adults"),
  ]);
  assert.deepEqual(found, { emails: ["test@example.com"], phones: ["+351912345678"] });
});

test("referências aceites seguem o formato do conversationId da ingestão", () => {
  assert.equal(validLeadId("BLU-AC2EE15506850505"), true);
  assert.equal(validLeadId("../etc/passwd"), false);
  assert.equal(validLeadId("short"), false);
});
