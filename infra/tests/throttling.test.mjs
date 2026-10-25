import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteBuild = path.resolve(infraDir, '../frontend/blu-cloud-site/dist/client');

// Sintetiza a aplicação com uma conta fictícia, sem publicar recursos.
test('public chatbot API stage throttles every route and chat more tightly', { skip: !existsSync(siteBuild) && 'frontend build missing: run the blu-cloud-site build first', timeout: 240000 }, () => {
  const outdir = mkdtempSync(path.join(tmpdir(), 'blu-cdk-throttle-'));
  try {
    const result = spawnSync(process.execPath, ['aws-split-app.mjs'], {
      cwd: infraDir,
      env: { ...process.env, TARGET_AWS_ACCOUNT_ID: '123456789012', CDK_OUTDIR: outdir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const template = JSON.parse(readFileSync(path.join(outdir, 'BluCostaFrontend.template.json'), 'utf8'));
    const stages = Object.values(template.Resources).filter(resource => resource.Type === 'AWS::ApiGatewayV2::Stage');
    assert.equal(stages.length, 1);
    const { DefaultRouteSettings, RouteSettings } = stages[0].Properties;
    assert.deepEqual(DefaultRouteSettings, { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 });
    // JSON CloudFormation: a capitalização incorreta pode ser ignorada pela AWS.
    assert.deepEqual(RouteSettings, { 'POST /v1/chat': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 } });
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
});
