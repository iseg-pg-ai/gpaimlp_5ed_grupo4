import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CONTACTED,
  NOTE_LIMIT,
  OPEN_STATUSES,
  cleanTags,
  contactDetails,
  toLead,
  toMessage,
  type Item,
  type LeadDetail,
  type LeadFilter,
} from "./leads-model.ts";

// Leitura no servidor com as credenciais do ambiente (perfil AWS local ou papel do Studio).
export class LeadsNotConfigured extends Error {}
export class LeadNotFound extends Error {}

function tables() {
  const messages = process.env.BLU_CONVERSATION_TABLE;
  const intelligence = process.env.BLU_INTELLIGENCE_TABLE;
  if (!messages || !intelligence)
    throw new LeadsNotConfigured(
      "Defina BLU_CONVERSATION_TABLE e BLU_INTELLIGENCE_TABLE (saídas da stack BluCostaData).",
    );
  return { messages, intelligence };
}

let client: DynamoDBClient | undefined;
const db = () => (client ??= new DynamoDBClient({}));

async function queryAll(input: ConstructorParameters<typeof QueryCommand>[0]) {
  const items: Item[] = [];
  let start: QueryCommand["input"]["ExclusiveStartKey"];
  do {
    const page = await db().send(new QueryCommand({ ...input, ExclusiveStartKey: start }));
    items.push(...((page.Items ?? []) as Item[]));
    start = page.LastEvaluatedKey;
  } while (start && items.length < 1000);
  return items;
}

export async function listLeads(filter: LeadFilter) {
  const { intelligence } = tables();
  const statuses = filter === "contacted" ? [CONTACTED] : [...OPEN_STATUSES];
  const groups = await Promise.all(
    statuses.map((status) =>
      queryAll({
        TableName: intelligence,
        IndexName: "FollowUpIndex",
        KeyConditionExpression: "followUpStatus = :status",
        ExpressionAttributeValues: { ":status": { S: status } },
        ScanIndexForward: filter !== "contacted",
      }),
    ),
  );
  const leads = groups.flat().map(toLead);
  return filter === "contacted"
    ? leads.sort((a, b) => (b.contactedAt ?? "").localeCompare(a.contactedAt ?? ""))
    : leads.sort((a, b) => a.followUpAt.localeCompare(b.followUpAt));
}

export async function getLead(id: string): Promise<LeadDetail> {
  const { messages, intelligence } = tables();
  const key = { ":id": { S: id } };
  const [records, transcript] = await Promise.all([
    queryAll({
      TableName: intelligence,
      KeyConditionExpression: "conversationId = :id",
      ExpressionAttributeValues: key,
    }),
    queryAll({
      TableName: messages,
      KeyConditionExpression: "conversationId = :id",
      ExpressionAttributeValues: key,
    }),
  ]);
  const profile = records.find((item) => item.recordKey?.S === "PROFILE");
  if (!profile) throw new LeadNotFound("Contacto não encontrado.");
  const consent = records.find((item) => item.eventType?.S === "lead.consent.granted");
  const ordered = transcript.map(toMessage).sort((a, b) => a.at.localeCompare(b.at));
  return {
    ...toLead(profile),
    messages: ordered,
    ...(!profile.consentAt?.S && consent?.occurredAt?.S ? { consentAt: consent.occurredAt.S } : {}),
    ...contactDetails(ordered),
  };
}

/** Uma nova mensagem do cliente volta a colocar o seguimento em PENDING (event-processor). */
export async function markContacted(id: string, now = new Date().toISOString()) {
  const { intelligence } = tables();
  try {
    await db().send(
      new UpdateItemCommand({
        TableName: intelligence,
        Key: { conversationId: { S: id }, recordKey: { S: "PROFILE" } },
        ConditionExpression: "attribute_exists(conversationId)",
        UpdateExpression: "SET followUpStatus = :contacted, contactedAt = :now, updatedAt = :now",
        ExpressionAttributeValues: { ":contacted": { S: CONTACTED }, ":now": { S: now } },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException)
      throw new LeadNotFound("Contacto não encontrado.");
    throw error;
  }
}

/** Etiquetas e nota do curador ficam no perfil do contacto (CRM); vazias são removidas. */
export async function tagLead(
  id: string,
  tags: unknown,
  note: unknown,
  now = new Date().toISOString(),
) {
  const { intelligence } = tables();
  const chosen = cleanTags(tags);
  const text = typeof note === "string" ? note.trim().slice(0, NOTE_LIMIT) : "";
  const set = ["taggedAt = :now", "updatedAt = :now"];
  const remove: string[] = [];
  const values: Record<string, { S: string } | { SS: string[] }> = { ":now": { S: now } };
  if (chosen.length) {
    set.push("tags = :tags");
    values[":tags"] = { SS: chosen };
  } else remove.push("tags");
  if (text) {
    set.push("curatorNote = :note");
    values[":note"] = { S: text };
  } else remove.push("curatorNote");
  try {
    await db().send(
      new UpdateItemCommand({
        TableName: intelligence,
        Key: { conversationId: { S: id }, recordKey: { S: "PROFILE" } },
        ConditionExpression: "attribute_exists(conversationId)",
        UpdateExpression: `SET ${set.join(", ")}${remove.length ? ` REMOVE ${remove.join(", ")}` : ""}`,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException)
      throw new LeadNotFound("Contacto não encontrado.");
    throw error;
  }
}
