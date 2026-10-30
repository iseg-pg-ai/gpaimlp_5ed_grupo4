import { createHash } from 'node:crypto';
import { ConditionalCheckFailedException, DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { createAlerter, createAnalyser, createAssigner, createDispatcher, createPlanner } from './dispatch-core.mjs';
import { SETTINGS, currentSettings } from './settings.mjs';
import { NOTIFY } from './schedule.mjs';
import { WHATSAPP_TEST, inboxRecord, whatsappMode } from './whatsapp-test.mjs';
import { TEAM_ALERTS } from './team-alerts.mjs';
import { FEED } from './tasks.mjs';
import { listTeamMembers } from './team.mjs';

const db = new DynamoDBClient({});
const lambda = new LambdaClient({});
const s3 = new S3Client({});
const ses = new SESClient({});
const sns = new SNSClient({});
const cognito = new CognitoIdentityProviderClient({});
const bedrock = new BedrockRuntimeClient({});
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

const query = async input => (await db.send(new QueryCommand(input))).Items ?? [];
const inPartition = (TableName, id, prefix) => query({ TableName, KeyConditionExpression: prefix ? 'conversationId = :id AND begins_with(recordKey, :prefix)' : 'conversationId = :id', ExpressionAttributeValues: { ':id': { S: id }, ...(prefix ? { ':prefix': { S: prefix } } : {}) } });

const planAuto = createPlanner({
  settings: async () => currentSettings(await inPartition(env.INTELLIGENCE_TABLE_NAME, SETTINGS.partition, SETTINGS.prefix)),
  leads: async () => (await Promise.all(['PENDING', 'QUEUED_FOR_REVIEW', 'CONTACTED'].map(status => query({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :s', ExpressionAttributeValues: { ':s': { S: status } } })))).flat(),
  autoKeys: async id => (await inPartition(env.INTELLIGENCE_TABLE_NAME, id, 'NOTIFY#AUTO#')).map(item => item.recordKey.S),
  transcript: id => inPartition(env.MESSAGE_TABLE_NAME, id),
  // Criação condicional: duas execuções sobrepostas nunca preparam a mesma mensagem duas vezes.
  create: async (id, record) => {
    try {
      await db.send(new PutItemCommand({ TableName: env.INTELLIGENCE_TABLE_NAME, Item: { conversationId: { S: id }, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== '').map(([key, value]) => [key, { S: String(value) }])) }, ConditionExpression: 'attribute_not_exists(recordKey)' }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  },
});

const dispatch = createDispatcher({
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
    // Modo de teste: a mensagem fica na caixa de teste da intranet e nada é enviado à Meta.
    if (whatsappMode(env.WHATSAPP_MODE) === 'test') {
      const record = inboxRecord({ at: new Date().toISOString(), id: message.requestId, direction: 'out', to: message.to, text: message.text, title: message.title, leadId: message.conversationId, author: message.approvedBy, authorName: 'Lembrete agendado' });
      try {
        await db.send(new PutItemCommand({ TableName: env.INTELLIGENCE_TABLE_NAME, Item: { conversationId: { S: WHATSAPP_TEST.partition }, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== '').map(([key, value]) => [key, { S: String(value) }])) }, ConditionExpression: 'attribute_not_exists(recordKey)' }));
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
      }
      return { delivery: WHATSAPP_TEST.delivery };
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

const putNew = async (id, record) => {
  try {
    await db.send(new PutItemCommand({ TableName: env.INTELLIGENCE_TABLE_NAME, Item: { conversationId: { S: id }, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== '').map(([key, value]) => [key, { S: String(value) }])) }, ConditionExpression: 'attribute_not_exists(recordKey)' }));
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
};
const byStatus = status => query({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :s', ExpressionAttributeValues: { ':s': { S: status } } });

const raiseAlerts = createAlerter({
  settings: () => inPartition(env.INTELLIGENCE_TABLE_NAME, SETTINGS.partition, SETTINGS.prefix),
  leads: async () => (await Promise.all(['PENDING', 'QUEUED_FOR_REVIEW', 'CONTACTED'].map(byStatus))).flat(),
  queryStatus: byStatus,
  queryAgenda: (status, from, until) => query({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :s AND followUpAt BETWEEN :from AND :until', ExpressionAttributeValues: { ':s': { S: status }, ':from': { S: from }, ':until': { S: until } } }),
  listTeam: () => listTeamMembers(cognito, env.USER_POOL_ID),
  create: record => putNew(TEAM_ALERTS.partition, record),
  markAlert: (key, delivery) => update(TEAM_ALERTS.partition, `${TEAM_ALERTS.prefix}${key}`, { delivery }, 'attribute_exists(recordKey)'),
  emailEnabled: Boolean(env.EMAIL_FROM),
  // Alerta interno à equipa: referência e destino do lead, nunca contactos nem mensagens.
  sendAlert: alert => ses.send(new SendEmailCommand({
    Source: env.EMAIL_FROM,
    Destination: { ToAddresses: alert.to },
    Message: {
      Subject: { Data: `BLU equipa: ${alert.level === 'bad' ? 'urgente' : 'atenção'}`, Charset: 'UTF-8' },
      Body: { Text: { Data: `${alert.text}

Abrir a intranet: ${env.INTRANET_URL || 'intranet BLU'}`, Charset: 'UTF-8' } },
    },
  })),
});

const autoAssign = createAssigner({
  settings: () => inPartition(env.INTELLIGENCE_TABLE_NAME, SETTINGS.partition, SETTINGS.prefix),
  leads: async () => (await Promise.all(['PENDING', 'QUEUED_FOR_REVIEW'].map(byStatus))).flat(),
  listTeam: () => listTeamMembers(cognito, env.USER_POOL_ID),
  // Só grava se o responsável ainda for o que foi lido (nenhum, ou uma conta desativada).
  assign: async (id, set, previous) => {
    try {
      if (previous) await update(id, 'PROFILE', set, 'assignedTo = :previous', { ':previous': { S: previous } });
      else await update(id, 'PROFILE', set, 'attribute_exists(recordKey) AND attribute_not_exists(assignedTo)');
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  },
  feed: record => putNew(FEED.partition, record),
});

// Análise automática das conversas: o modelo devolve só JSON; signals.mjs valida antes de gravar.
const analyse = createAnalyser({
  leads: async () => (await Promise.all(['PENDING', 'QUEUED_FOR_REVIEW', 'CONTACTED'].map(byStatus))).flat(),
  transcript: id => inPartition(env.MESSAGE_TABLE_NAME, id),
  modelId: env.MODEL_ID,
  classify: async ({ system, user }) => {
    const result = await bedrock.send(new ConverseCommand({
      modelId: env.MODEL_ID,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 300, temperature: 0 },
    }));
    return result.output?.message?.content?.map(part => part.text ?? '').join('').trim() ?? '';
  },
  saveAnalysis: (id, fields) => update(id, 'PROFILE', fields, 'attribute_exists(recordKey)'),
});

// Primeiro prepara as mensagens automáticas ligadas; uma falha aqui não impede os lembretes.
// Os alertas à equipa correm depois do envio, para apanharem os lembretes que acabaram de falhar.
export async function handler() {
  let planned = 0;
  try {
    planned = await planAuto();
  } catch (error) {
    console.error(JSON.stringify({ planner: 'failed', error: error?.name ?? 'Error' }));
  }
  const sent = await dispatch();
  // A análise vem antes dos alertas, para um risco detetado agora avisar já a equipa.
  let analysis = { failed: true };
  if (env.MODEL_ID) {
    try {
      analysis = await analyse();
    } catch (error) {
      console.error(JSON.stringify({ analysis: 'failed', error: error?.name ?? 'Error' }));
    }
  }
  // A atribuição vem antes dos alertas, para a pessoa que recebe o lead ser avisada já.
  let assignment = { failed: true };
  try {
    assignment = await autoAssign();
  } catch (error) {
    console.error(JSON.stringify({ assignment: 'failed', error: error?.name ?? 'Error' }));
  }
  let alerts = { failed: true };
  try {
    alerts = await raiseAlerts();
  } catch (error) {
    console.error(JSON.stringify({ alerts: 'failed', error: error?.name ?? 'Error' }));
  }
  return { planned, ...sent, analysis, assignment, alerts };
}
