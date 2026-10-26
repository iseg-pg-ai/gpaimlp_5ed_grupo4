import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { conversationId, createFixture, env, question, retrievedFacts } from './helpers/backoffice-rag-fixture.mjs';

const baselinePath = process.argv[2];
if (!baselinePath) throw new Error('Indique o index.mjs original como primeiro argumento.');
const source = await readFile(baselinePath, 'utf8');

async function loadOriginal(fixture) {
  // O corpo original é executado sem alterações; só as três fronteiras SDK são simuladas.
  const context = vm.createContext({ process: { env }, console });
  const command = operation => class {
    constructor(input) { this.input = input; this.operation = operation; }
  };
  const client = class { async send(request) { return fixture.deps[request.operation](request.input); } };
  const exports = {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: client, QueryCommand: command('query'), GetItemCommand: command('getItem') },
    '@aws-sdk/client-s3': { S3Client: client, ListObjectsV2Command: command('listObjects'), GetObjectCommand: command('getObject') },
    '@aws-sdk/client-bedrock-runtime': { BedrockRuntimeClient: client, ConverseCommand: command('converse') },
  };
  const module = new vm.SourceTextModule(source, { context, identifier: path.resolve(baselinePath) });
  await module.link(specifier => {
    if (!Object.hasOwn(exports, specifier)) throw new Error(`Import inesperado: ${specifier}`);
    const values = exports[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace.handler;
}

test('regressão original: PROFILE continua disponível após 25 eventos', async () => {
  const fixture = createFixture();
  await (await loadOriginal(fixture))({ conversationId, question });
  assert.ok(retrievedFacts(fixture).profile, 'PROFILE foi excluído pela página de 20 eventos');
});

test('regressão original: o ciclo de vida começa pelo evento mais recente', async () => {
  const fixture = createFixture();
  await (await loadOriginal(fixture))({ conversationId, question });
  assert.equal(retrievedFacts(fixture).lifecycle[0].sourceId, 'event-25');
});

test('regressão original: JSON inválido produz 400 em vez de exceção', async () => {
  const fixture = createFixture();
  assert.equal((await (await loadOriginal(fixture))({ body: '{' })).statusCode, 400);
});

test('regressão original: a resposta não afirma verificação inexistente', async () => {
  const fixture = createFixture();
  const result = await (await loadOriginal(fixture))({ conversationId, question });
  assert.equal(JSON.parse(result.body).grounded, false);
});
