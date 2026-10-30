import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('backoffice retrieval is bounded to approved knowledge and requires human approval', async () => {
  // A guarda cobre também o módulo extraído; backoffice-rag.test.mjs executa o handler.
  const source = (await Promise.all([read('../lambda/backoffice-rag/index.mjs'), read('../lambda/backoffice-rag/handler.mjs')])).join('\n');
  assert.match(source, /Prefix: 'curated\/approved\/'/);
  assert.doesNotMatch(source, /Prefix: 'sessions\/'/);
  assert.match(source, /requiresHumanApproval: true/);
});

test('churn evaluator queues review and never automatic customer contact', async () => {
  const source = await read('../lambda/churn-evaluator/index.mjs');
  assert.match(source, /followup\.review\.requested/);
  assert.match(source, /automaticCustomerContact: false/);
  assert.match(source, /QUEUED_FOR_REVIEW/);
});

test('full deployment is fail-fast and deploys every stack', async () => {
  const source = await read('../../scripts/deploy-aws.sh');
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /cdk deploy --all/);
  assert.match(source, /get-caller-identity/);
});
