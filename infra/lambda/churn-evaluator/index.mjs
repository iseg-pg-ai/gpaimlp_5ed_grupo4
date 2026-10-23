import { DynamoDBClient, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const db = new DynamoDBClient({});
const sqs = new SQSClient({});
const s3 = new S3Client({});

export async function handler() {
  const evaluatedAt = new Date().toISOString();
  const due = await db.send(new QueryCommand({
    TableName: process.env.INTELLIGENCE_TABLE_NAME,
    IndexName: 'FollowUpIndex',
    KeyConditionExpression: 'followUpStatus=:pending AND followUpAt<=:now',
    ExpressionAttributeValues: { ':pending': { S: 'PENDING' }, ':now': { S: evaluatedAt } },
    Limit: 100,
  }));
  const evidence = [];
  for (const item of due.Items || []) {
    if (item.synthetic?.BOOL === true) continue;
    const conversationId = item.conversationId.S;
    const task = { type: 'followup.review.requested', conversationId, dueAt: item.followUpAt.S, evaluatedAt, reason: 'inactive-conversation', requiresHumanApproval: true, automaticCustomerContact: false };
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.CRM_QUEUE_URL, MessageBody: JSON.stringify(task) }));
    await db.send(new UpdateItemCommand({ TableName: process.env.INTELLIGENCE_TABLE_NAME, Key: { conversationId: { S: conversationId }, recordKey: { S: 'PROFILE' } }, UpdateExpression: 'SET followUpStatus=:queued, followUpQueuedAt=:now', ExpressionAttributeValues: { ':queued': { S: 'QUEUED_FOR_REVIEW' }, ':now': { S: evaluatedAt } } }));
    evidence.push(task);
  }
  const key = `controls/churn-followups/${evaluatedAt.slice(0, 10)}/${evaluatedAt.replaceAll(':', '-')}.json`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.EVIDENCE_BUCKET, Key: key, Body: JSON.stringify({ evaluatedAt, count: evidence.length, tasks: evidence }, null, 2), ContentType: 'application/json', ServerSideEncryption: 'AES256' }));
  return { evaluatedAt, queued: evidence.length, evidenceKey: key };
}
