// Processa os eventos recebidos para atualizar o estado persistente do acompanhamento.
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { messageItem, profileUpdate } from './item.mjs';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const sqs = new SQSClient({});

export async function handler(event) {
  const batchItemFailures = [];
  for (const sqsRecord of event.Records || []) {
    try {
      const record = JSON.parse(sqsRecord.body);
      const occurredAtId = `${record.occurredAt}#${record.id}`;
      await db.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: messageItem(record, occurredAtId) }));
      await db.send(new UpdateItemCommand({ TableName: process.env.INTELLIGENCE_TABLE_NAME, ...profileUpdate(record) }));
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
