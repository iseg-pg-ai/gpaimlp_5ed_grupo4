import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
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
