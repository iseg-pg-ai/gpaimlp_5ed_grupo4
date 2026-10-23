import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const db = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});

function response(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  const input = typeof event?.body === 'string' ? JSON.parse(event.body || '{}') : (event || {});
  const conversationId = String(input.conversationId || '');
  const question = String(input.question || '').trim().slice(0, 2000);
  if (!/^[A-Za-z0-9-]{8,80}$/.test(conversationId) || !question) return response(400, { error: 'conversationId and question are required' });

  const [messages, intelligence, listed] = await Promise.all([
    db.send(new QueryCommand({ TableName: process.env.MESSAGE_TABLE_NAME, KeyConditionExpression: 'conversationId=:id', ExpressionAttributeValues: { ':id': { S: conversationId } }, ScanIndexForward: false, Limit: 30 })),
    db.send(new QueryCommand({ TableName: process.env.INTELLIGENCE_TABLE_NAME, KeyConditionExpression: 'conversationId=:id', ExpressionAttributeValues: { ':id': { S: conversationId } }, Limit: 20 })),
    s3.send(new ListObjectsV2Command({ Bucket: process.env.KNOWLEDGE_BUCKET, Prefix: 'curated/approved/', MaxKeys: 100 })),
  ]);
  const terms = new Set(question.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []);
  const candidates = (listed.Contents || []).filter(item => item.Key.endsWith('.json')).map(item => ({ key: item.Key, score: [...terms].filter(term => item.Key.toLowerCase().includes(term)).length })).sort((a, b) => b.score - a.score).slice(0, 5);
  const approvedKnowledge = [];
  for (const candidate of candidates) {
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.KNOWLEDGE_BUCKET, Key: candidate.key }));
    const text = (await object.Body.transformToString()).slice(0, 12000);
    const score = [...terms].filter(term => text.toLowerCase().includes(term)).length + candidate.score;
    approvedKnowledge.push({ sourceId: candidate.key, score, text });
  }
  approvedKnowledge.sort((a, b) => b.score - a.score);
  const facts = {
    profile: intelligence.Items?.find(item => item.recordKey?.S === 'PROFILE') || null,
    lifecycle: (intelligence.Items || []).filter(item => item.recordKey?.S?.startsWith('EVENT#')).map(item => ({ sourceId: item.sourceId?.S, eventType: item.eventType?.S, at: item.occurredAt?.S, summary: item.summary?.S, context: item.contextJson?.S })),
    messages: (messages.Items || []).reverse().map(item => ({ at: item.occurredAtId?.S, actor: item.actor?.S, channel: item.channel?.S, text: item.text?.S })),
    approvedKnowledge: approvedKnowledge.slice(0, 3),
  };
  const sourceIds = [...(messages.Items || []).map(item => item.occurredAtId?.S), ...(intelligence.Items || []).map(item => item.sourceId?.S), ...approvedKnowledge.slice(0, 3).map(item => item.sourceId)].filter(Boolean);
  const result = await bedrock.send(new ConverseCommand({
    modelId: process.env.MODEL_ID,
    system: [{ text: 'You are an internal BLU curator assistant. Answer only from the supplied customer intelligence. Distinguish facts from suggestions. Never invent availability, price, margin, consent, or approval. Churn follow-ups are recommendations requiring human approval. Cite source IDs in square brackets. If evidence is insufficient, say so.' }],
    messages: [{ role: 'user', content: [{ text: `QUESTION:\n${question}\n\nRETRIEVED CUSTOMER INTELLIGENCE:\n${JSON.stringify(facts)}` }] }],
    inferenceConfig: { maxTokens: 700, temperature: 0.1, topP: 0.8 },
  }));
  const answer = result.output?.message?.content?.find(part => part.text)?.text?.trim();
  return response(200, { answer: answer || 'Insufficient evidence.', conversationId, sourceIds, grounded: true, requiresHumanApproval: true });
}
