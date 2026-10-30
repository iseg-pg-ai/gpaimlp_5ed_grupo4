// Responde a pedidos internos com recuperação de conhecimento, sujeito à identidade e aos
// recursos autorizados.
import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHandler } from './handler.mjs';

const db = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});

export const handler = createHandler({
  query: input => db.send(new QueryCommand(input)),
  getItem: input => db.send(new GetItemCommand(input)),
  listObjects: input => s3.send(new ListObjectsV2Command(input)),
  getObject: input => s3.send(new GetObjectCommand(input)),
  converse: input => bedrock.send(new ConverseCommand(input)),
});
