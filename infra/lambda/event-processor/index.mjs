import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const sqs = new SQSClient({});

export async function handler(event) {
  const batchItemFailures = [];
  for (const sqsRecord of event.Records || []) {
    try {
      const record = JSON.parse(sqsRecord.body);
      const occurredAtId = `${record.occurredAt}#${record.id}`;
      await db.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: {
        conversationId: { S: record.conversationId }, occurredAtId: { S: occurredAtId },
        leadId: { S: record.leadId || '' }, actor: { S: record.message.actor }, channel: { S: record.message.channel },
        text: { S: record.message.text }, source: { S: record.source }, synthetic: { BOOL: record.synthetic === true },
        journeyConsent: { BOOL: true }, analyticsConsent: { BOOL: record.analyticsConsent === true },
        schemaVersion: { N: String(record.schemaVersion || 1) },
        eventType: { S: record.eventType || 'conversation.message.recorded' },
        ...(record.context ? { contextJson: { S: JSON.stringify(record.context) } } : {}),
      } }));
      const followUpAt = new Date(Date.parse(record.occurredAt) + 3 * 86400000).toISOString();
      await db.send(new UpdateItemCommand({
        TableName: process.env.INTELLIGENCE_TABLE_NAME,
        Key: { conversationId: { S: record.conversationId }, recordKey: { S: 'PROFILE' } },
        UpdateExpression: 'SET lastActivityAt=:at, followUpAt=:due, followUpStatus=:pending, lastChannel=:channel, lastEventType=:type, analyticsConsent=:analytics, synthetic=:synthetic, updatedAt=:at ADD messageCount :one',
        ExpressionAttributeValues: {
          ':at': { S: record.occurredAt }, ':due': { S: followUpAt }, ':pending': { S: 'PENDING' },
          ':channel': { S: record.message.channel }, ':type': { S: record.eventType || 'conversation.message.recorded' },
          ':analytics': { BOOL: record.analyticsConsent === true }, ':synthetic': { BOOL: record.synthetic === true }, ':one': { N: '1' },
        },
      }));
      if (record.eventType !== 'conversation.message.recorded' || record.context) {
        await db.send(new PutItemCommand({ TableName: process.env.INTELLIGENCE_TABLE_NAME, Item: {
          conversationId: { S: record.conversationId }, recordKey: { S: `EVENT#${occurredAtId}` },
          eventType: { S: record.eventType || 'conversation.message.recorded' }, occurredAt: { S: record.occurredAt },
          sourceId: { S: record.id }, source: { S: record.source },
          summary: { S: record.message.text.slice(0, 1000) },
          ...(record.context ? { contextJson: { S: JSON.stringify(record.context) } } : {}),
        } }));
      }
      await s3.send(new PutObjectCommand({
        Bucket: process.env.ARCHIVE_BUCKET,
        Key: `sessions/${record.conversationId}/${record.occurredAt.replaceAll(':', '-')}#${record.id}.json`,
        Body: JSON.stringify(record), ContentType: 'application/json', ServerSideEncryption: 'AES256',
        Metadata: { synthetic: String(record.synthetic === true), source: record.source, analytics: String(record.analyticsConsent === true) },
      }));
      await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.CRM_QUEUE_URL,
        MessageBody: JSON.stringify({ type: 'conversation.message.recorded', ...record }),
      }));
    } catch (error) {
      console.error('Conversation event failed', sqsRecord.messageId, error);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }
  return { batchItemFailures };
}
