import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('site deployments make browsers revalidate unhashed pages and config', async () => {
  const source = await read('../aws-split-app.mjs');
  for (const id of ['DeployFrontend', 'DeploySocialConversationBridge']) {
    const start = source.indexOf(`BucketDeployment(this, '${id}'`);
    assert.ok(start > 0, id);
    const block = source.slice(start, source.indexOf('});', start));
    assert.match(block, /cacheControl: \[s3deploy\.CacheControl\.noCache\(\)\]/, id);
  }
});
