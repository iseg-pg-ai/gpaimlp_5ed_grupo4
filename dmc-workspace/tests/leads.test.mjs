import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanTags,
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
    journey: {},
    tags: [],
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

test("perfil inclui a etapa, o consentimento e o último contexto da viagem", () => {
  const lead = toLead({
    conversationId: { S: "BLU-BA23A1CDB0BC48F0" },
    journeyStage: { S: "curator-follow-up" },
    consentAt: { S: "2026-10-25T16:00:00.000Z" },
    journeyJson: {
      S: JSON.stringify({
        journeyReference: "BLU-BA23A1CDB0BC48F0",
        destination: "Lisbon and Sintra",
        campaign: "autumn-test",
        rating: 5,
      }),
    },
  });
  assert.equal(lead.stage, "curator-follow-up");
  assert.equal(lead.consentAt, "2026-10-25T16:00:00.000Z");
  assert.deepEqual(lead.journey, { destination: "Lisbon and Sintra", campaign: "autumn-test" });
  assert.deepEqual(toLead({ journeyJson: { S: "{broken" } }).journey, {});
});

test("etiquetas aceitam só a lista fixa, sem duplicados, e a nota chega ao contacto", () => {
  assert.deepEqual(cleanTags(["hot", "hot", "admin", 3, "proposal-next"]), [
    "hot",
    "proposal-next",
  ]);
  assert.deepEqual(cleanTags("hot"), []);
  const lead = toLead({
    conversationId: { S: "BLU-BA23A1CDB0BC48F0" },
    tags: { SS: ["vip", "unknown"] },
    curatorNote: { S: "Ligar depois das 18h." },
    taggedAt: { S: "2026-10-25T17:00:00.000Z" },
  });
  assert.deepEqual(lead.tags, ["vip"]);
  assert.equal(lead.curatorNote, "Ligar depois das 18h.");
  assert.equal(lead.taggedAt, "2026-10-25T17:00:00.000Z");
});
