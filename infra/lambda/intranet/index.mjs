import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  AdminAddUserToGroupCommand, AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient, UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DescribeSecretCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ConditionalCheckFailedException, DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';
import { NotFound, createApp } from './app.mjs';
import { listTeamMembers } from './team.mjs';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const sqs = new SQSClient({});
const lambda = new LambdaClient({});
const cloudwatch = new CloudWatchClient({});
const cognito = new CognitoIdentityProviderClient({});
const secretsManager = new SecretsManagerClient({});
const bedrock = new BedrockRuntimeClient({});
const env = process.env;
const WORKER_PREFIX = 'BluCosta';
const MANIFEST_KEY = 'controls/manifests/customer-intelligence-controls.json';
const POLICY_REPORT_KEY = 'controls/manifests/policy-report.json';

async function queryAll(input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < 1000);
  return items;
}

const byConversation = (TableName, id) => queryAll({ TableName, KeyConditionExpression: 'conversationId = :id', ExpressionAttributeValues: { ':id': { S: id } } });

async function updateProfile(id, set, remove = []) {
  const names = {};
  const values = {};
  const assignments = Object.entries(set).map(([key, value], index) => {
    names[`#s${index}`] = key;
    values[`:s${index}`] = Array.isArray(value) ? { SS: value } : { S: value };
    return `#s${index} = :s${index}`;
  });
  const removals = remove.map((key, index) => {
    names[`#r${index}`] = key;
    return `#r${index}`;
  });
  try {
    await db.send(new UpdateItemCommand({
      TableName: env.INTELLIGENCE_TABLE_NAME,
      Key: { conversationId: { S: id }, recordKey: { S: 'PROFILE' } },
      ConditionExpression: 'attribute_exists(conversationId)',
      UpdateExpression: `SET ${assignments.join(', ')}${removals.length ? ` REMOVE ${removals.join(', ')}` : ''}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) throw new NotFound();
    throw error;
  }
}

async function askRag(conversationId, question) {
  const result = await lambda.send(new InvokeCommand({ FunctionName: env.RAG_FUNCTION_NAME, Payload: Buffer.from(JSON.stringify({ conversationId, question })) }));
  const response = JSON.parse(Buffer.from(result.Payload ?? []).toString('utf8') || '{}');
  if (result.FunctionError || response.statusCode !== 200) throw new Error('RagFailed');
  return JSON.parse(response.body || '{}');
}

const listTeam = () => listTeamMembers(cognito, env.USER_POOL_ID);

async function queueDepth(url) {
  const { Attributes = {} } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'RedrivePolicy'] }));
  return { waiting: Number(Attributes.ApproximateNumberOfMessages ?? 0), inFlight: Number(Attributes.ApproximateNumberOfMessagesNotVisible ?? 0), redrive: Attributes.RedrivePolicy };
}

// arn:aws:sqs:<região>:<conta>:<nome> → URL da fila de mensagens falhadas.
const queueUrlOf = arn => {
  const [, , , region, accountId, name] = arn.split(':');
  return `https://sqs.${region}.amazonaws.com/${accountId}/${name}`;
};

async function workers(end) {
  const functions = [];
  let Marker;
  do {
    const page = await lambda.send(new ListFunctionsCommand({ Marker }));
    // Funções auxiliares do CDK (retenção de logs, cópia de ficheiros) não são workers do pipeline.
    functions.push(...(page.Functions ?? []).filter(fn => fn.FunctionName.startsWith(WORKER_PREFIX) && !/LogRetention|CustomCDK|CDKBucketDeployment|AutoDelete/.test(fn.FunctionName)));
    Marker = page.NextMarker;
  } while (Marker);
  if (!functions.length) return [];
  const queries = functions.flatMap((fn, index) => ['Invocations', 'Errors', 'Throttles'].map(metric => ({
    Id: `${metric.toLowerCase()}${index}`,
    MetricStat: { Metric: { Namespace: 'AWS/Lambda', MetricName: metric, Dimensions: [{ Name: 'FunctionName', Value: fn.FunctionName }] }, Period: 86400, Stat: 'Sum' },
  })));
  const results = new Map();
  for (let start = 0; start < queries.length; start += 500) {
    const page = await cloudwatch.send(new GetMetricDataCommand({ MetricDataQueries: queries.slice(start, start + 500), StartTime: new Date(end - 864e5), EndTime: end }));
    for (const result of page.MetricDataResults ?? []) results.set(result.Id, (result.Values ?? []).reduce((sum, value) => sum + value, 0));
  }
  return functions.map((fn, index) => ({
    name: fn.FunctionName.replace(/-[A-Za-z0-9]{8,}$/, '').replace(/[0-9A-F]{8}$/, ''),
    stack: fn.FunctionName.split('-')[0],
    runtime: fn.Runtime ?? '',
    lastModified: fn.LastModified ?? '',
    invocations24h: results.get(`invocations${index}`) ?? 0,
    errors24h: results.get(`errors${index}`) ?? 0,
    throttles24h: results.get(`throttles${index}`) ?? 0,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function readJson(Key) {
  const object = await s3.send(new GetObjectCommand({ Bucket: env.EVIDENCE_BUCKET, Key }));
  return JSON.parse(await object.Body.transformToString());
}

async function lastChurnRun(end) {
  const days = [0, 1, 2].map(offset => new Date(end - offset * 864e5).toISOString().slice(0, 10));
  for (const day of days) {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.EVIDENCE_BUCKET, Prefix: `controls/churn-followups/${day}/` }));
    const latest = (page.Contents ?? []).map(item => item.Key).sort().at(-1);
    if (latest) {
      const run = await readJson(latest);
      return { evaluatedAt: run.evaluatedAt, queued: run.count ?? 0, evidenceKey: latest };
    }
  }
  return null;
}

async function operations() {
  const end = new Date();
  const [events, crm, functions, churn] = await Promise.all([queueDepth(env.EVENTS_QUEUE_URL), queueDepth(env.CRM_QUEUE_URL), workers(end), lastChurnRun(end)]);
  const deadLetterArn = events.redrive ? JSON.parse(events.redrive).deadLetterTargetArn : '';
  const failed = deadLetterArn ? await queueDepth(queueUrlOf(deadLetterArn)) : { waiting: 0, inFlight: 0 };
  const strip = ({ redrive, ...depth }) => depth;
  return {
    checkedAt: end.toISOString(),
    queues: { conversationEvents: strip(events), failedEvents: strip(failed), curatorTasks: strip(crm) },
    workers: functions,
    churnReview: churn,
  };
}

async function governance() {
  const [manifest, policies, page] = await Promise.all([
    readJson(MANIFEST_KEY),
    readJson(POLICY_REPORT_KEY).catch(() => null),
    s3.send(new ListObjectsV2Command({ Bucket: env.EVIDENCE_BUCKET, Prefix: 'controls/', MaxKeys: 1000 })),
  ]);
  const evidence = (page.Contents ?? [])
    .map(item => ({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified?.toISOString?.() ?? '', etag: (item.ETag ?? '').replaceAll('"', '') }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    .slice(0, 25);
  return { manifest, policies, evidence };
}

// Registos da agenda (ACTIVITY# e NOTIFY#) no perfil da conversa; nunca substituem outros.
async function putRecords(id, records) {
  for (let start = 0; start < records.length; start += 10) {
    await Promise.all(records.slice(start, start + 10).map(record => db.send(new PutItemCommand({
      TableName: env.INTELLIGENCE_TABLE_NAME,
      Item: { conversationId: { S: id }, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== '' && value !== undefined).map(([key, value]) => [key, { S: String(value) }])) },
      ConditionExpression: 'attribute_not_exists(recordKey)',
    }))));
  }
}

async function setRecord(id, recordKey, set, expectStatus) {
  const names = {};
  const values = {};
  const assignments = Object.entries(set).map(([key, value], index) => {
    names[`#s${index}`] = key;
    values[`:s${index}`] = { S: value };
    return `#s${index} = :s${index}`;
  });
  if (expectStatus) values[':expected'] = { S: expectStatus };
  try {
    await db.send(new UpdateItemCommand({
      TableName: env.INTELLIGENCE_TABLE_NAME,
      Key: { conversationId: { S: id }, recordKey: { S: recordKey } },
      ConditionExpression: expectStatus ? 'followUpStatus = :expected' : 'attribute_exists(recordKey)',
      UpdateExpression: `SET ${assignments.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  } catch (error) {
    // Um lembrete entretanto enviado não é cancelado; uma atividade inexistente é 404.
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
    if (!expectStatus) throw new NotFound();
  }
}

// O Cognito envia o convite por email com uma palavra-passe temporária; MFA é configurado no primeiro login.
async function invite({ email, name, role }) {
  try {
    const created = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: env.USER_POOL_ID, Username: email, DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }, { Name: 'name', Value: name }],
    }));
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: env.USER_POOL_ID, Username: created.User.Username, GroupName: role }));
    return { username: created.User.Username };
  } catch (error) {
    if (error instanceof UsernameExistsException) return { exists: true };
    throw error;
  }
}

async function setRole(username, role, groups) {
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: env.USER_POOL_ID, Username: username, GroupName: role }));
  for (const group of groups.filter(item => item !== role)) {
    await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: env.USER_POOL_ID, Username: username, GroupName: group }));
  }
}

const setEnabled = (username, enabled) => cognito.send(new (enabled ? AdminEnableUserCommand : AdminDisableUserCommand)({ UserPoolId: env.USER_POOL_ID, Username: username }));

// Só metadados dos segredos (nome, finalidade, última alteração); nunca os valores.
async function secrets() {
  const managed = JSON.parse(env.MANAGED_SECRETS || '[]');
  return Promise.all(managed.map(async ({ arn, purpose }) => {
    try {
      const secret = await secretsManager.send(new DescribeSecretCommand({ SecretId: arn }));
      return { name: secret.Name, purpose, lastChanged: secret.LastChangedDate?.toISOString?.() ?? '', rotation: secret.RotationEnabled === true };
    } catch {
      return { name: arn.split(':').at(-1), purpose, lastChanged: '', rotation: false, unavailable: true };
    }
  }));
}

const partners = JSON.parse(env.PARTNERS_JSON || '{"partners":[]}').partners;

// Só escreve o texto de uma resposta simples; as regras e a verificação final ficam em guardrails.mjs.
async function draftReply({ system, user }) {
  const result = await bedrock.send(new ConverseCommand({
    modelId: env.MODEL_ID,
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: user }] }],
    inferenceConfig: { maxTokens: 160, temperature: 0.2 },
  }));
  return result.output?.message?.content?.map(part => part.text ?? '').join('').trim() ?? '';
}

// Assistente da intranet: devolve JSON com resposta e ações sugeridas; assistant.mjs valida tudo.
async function assist({ system, user }) {
  const result = await bedrock.send(new ConverseCommand({
    modelId: env.MODEL_ID,
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: user }] }],
    inferenceConfig: { maxTokens: 700, temperature: 0.1 },
  }));
  return result.output?.message?.content?.map(part => part.text ?? '').join('').trim() ?? '';
}

export const handler = createApp({
  partners,
  policyReport: () => readJson(POLICY_REPORT_KEY),
  invite,
  setRole,
  setEnabled,
  secrets,
  whatsappMode: env.WHATSAPP_MODE,
  newId: () => randomUUID(),
  putRecords,
  setRecord,
  queryRecords: (id, prefix) => queryAll({ TableName: env.INTELLIGENCE_TABLE_NAME, KeyConditionExpression: 'conversationId = :id AND begins_with(recordKey, :prefix)', ExpressionAttributeValues: { ':id': { S: id }, ':prefix': { S: prefix } } }),
  queryAgenda: (status, from, to) => queryAll({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :status AND followUpAt BETWEEN :from AND :to', ExpressionAttributeValues: { ':status': { S: status }, ':from': { S: from }, ':to': { S: to } } }),
  queryStatus: status => queryAll({ TableName: env.INTELLIGENCE_TABLE_NAME, IndexName: 'FollowUpIndex', KeyConditionExpression: 'followUpStatus = :status', ExpressionAttributeValues: { ':status': { S: status } } }),
  getRecords: id => byConversation(env.INTELLIGENCE_TABLE_NAME, id),
  getTranscript: id => byConversation(env.MESSAGE_TABLE_NAME, id),
  updateProfile,
  askRag,
  draftReply: env.MODEL_ID ? draftReply : undefined,
  assist: env.MODEL_ID ? assist : undefined,
  listTeam,
  operations,
  governance,
});
