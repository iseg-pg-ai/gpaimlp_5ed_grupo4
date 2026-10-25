import { createHash } from 'node:crypto';
import { ConditionalCheckFailedException, DynamoDBClient, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { createDispatcher } from './dispatch-core.mjs';
import { NOTIFY } from './schedule.mjs';

const db = new DynamoDBClient({});
const lambda = new LambdaClient({});
const s3 = new S3Client({});
const ses = new SESClient({});
const sns = new SNSClient({});
const env = process.env;

async function update(id, recordKey, set, condition, conditionValues = {}) {
  const names = {};
  const values = { ...conditionValues };
  const assignments = Object.entries(set).map(([key, value], index) => {
    names[`#s${index}`] = key;
    values[`:s${index}`] = { S: value };
    return `#s${index} = :s${index}`;
  });
  await db.send(new UpdateItemCommand({
    TableName: env.INTELLIGENCE_TABLE_NAME,
    Key: { conversationId: { S: id }, recordKey: { S: recordKey } },
    ConditionExpression: condition,
    UpdateExpression: `SET ${assignments.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export const handler = createDispatcher({
  queryDue: async until => {
    const result = await db.send(new QueryCommand({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :pending AND followUpAt <= :until', ExpressionAttributeValues: { ':pending': { S: NOTIFY.pending }, ':until': { S: until } }, Limit: 100 }));
    return result.Items ?? [];
  },
  claim: async (id, recordKey) => {
    try {
      await update(id, recordKey, { followUpStatus: NOTIFY.sending }, 'followUpStatus = :pending', { ':pending': { S: NOTIFY.pending } });
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  },
  finish: (id, recordKey, set) => update(id, recordKey, set, 'attribute_exists(recordKey)'),
  requestIdFor: recordKey => `notify-${createHash('sha256').update(recordKey).digest('hex').slice(0, 40)}`,
  // Cada canal só envia quando configurado no deploy; caso contrário o lembrete fica "preparado".
  send: async message => {
    if (message.channel === 'email') {
      if (!env.EMAIL_FROM) throw new Error('Email channel is not configured');
      await ses.send(new SendEmailCommand({
        Source: env.EMAIL_FROM,
        Destination: { ToAddresses: [message.to] },
        Message: { Subject: { Data: `BLU Costa: ${message.title || 'your reminder'}`, Charset: 'UTF-8' }, Body: { Text: { Data: message.text, Charset: 'UTF-8' } } },
      }));
      return;
    }
    if (message.channel === 'sms') {
      if (env.SMS_ENABLED !== 'true') throw new Error('SMS channel is not configured');
      await sns.send(new PublishCommand({ PhoneNumber: `+${message.to}`, Message: message.text.slice(0, 600), MessageAttributes: { 'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' } } }));
      return;
    }
    const result = await lambda.send(new InvokeCommand({ FunctionName: env.WHATSAPP_FUNCTION_NAME, Payload: Buffer.from(JSON.stringify({ ...message, kind: 'text' })) }));
    if (result.FunctionError) {
      const payload = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf8') || '{}');
      throw new Error(String(payload.errorMessage ?? 'WhatsApp send failed'));
    }
  },
  // Evidência da execução sem texto nem números: só chaves, destinatário e estado.
  evidence: (now, results) => s3.send(new PutObjectCommand({
    Bucket: env.EVIDENCE_BUCKET,
    Key: `controls/scheduled-notifications/${now.toISOString().slice(0, 10)}/${now.toISOString().replaceAll(':', '-')}.json`,
    Body: JSON.stringify({ checkedAt: now.toISOString(), results }, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  })),
});
