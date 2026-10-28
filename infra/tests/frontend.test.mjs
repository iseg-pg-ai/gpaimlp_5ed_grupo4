import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const infraDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const account = '123456789012';
const curator = `arn:aws:iam::${account}:role/blu-curator`;
const siteBuilt = existsSync(path.join(infraDir, '../frontend/blu-cloud-site/dist/client'));
const options = { skip: !siteBuilt && 'build frontend/blu-cloud-site first', timeout: 240000 };

// Partilhar a síntese válida; cada caso continua a verificar o template produzido.
async function synth(trusted) {
  const outdir = await mkdtemp(path.join(tmpdir(), 'blu-frontend-synth-'));
  try {
    await promisify(execFile)(process.execPath, ['aws-split-app.mjs'], {
      cwd: infraDir,
      env: {
        ...process.env,
        TARGET_AWS_ACCOUNT_ID: account,
        TARGET_AWS_REGION: 'eu-west-1',
        CDK_OUTDIR: outdir,
        BACKOFFICE_TRUSTED_PRINCIPAL_ARNS: trusted,
        CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:disable-asset-staging': true }),
      },
      timeout: 240000,
    });
    const template = async name => JSON.parse(await readFile(path.join(outdir, `${name}.template.json`), 'utf8'));
    return { frontend: await template('BluCostaFrontend'), backoffice: await template('BluCostaBackoffice') };
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

let templates;
before(async () => {
  if (siteBuilt) templates = await synth(curator);
});
const resources = (template, type) => Object.values(template.Resources).filter(resource => resource.Type === type);
const analysisRoles = template => resources(template, 'AWS::IAM::Role').filter(resource => resource.Properties.Description?.startsWith('Backoffice conversation analysis'));

test('site deployments make browsers revalidate unhashed pages and config', options, () => {
  const deployments = resources(templates.frontend, 'Custom::CDKBucketDeployment');
  assert.equal(deployments.length, 2);
  for (const deployment of deployments) assert.equal(deployment.Properties.SystemMetadata['cache-control'], 'no-cache');
});

test('public chatbot API stage throttles every route and chat more tightly', options, () => {
  const stages = resources(templates.frontend, 'AWS::ApiGatewayV2::Stage');
  assert.equal(stages.length, 1);
  const { DefaultRouteSettings, RouteSettings } = stages[0].Properties;
  assert.deepEqual(DefaultRouteSettings, { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 });
  // A capitalização incorreta no CloudFormation pode ser ignorada pela AWS.
  assert.deepEqual(RouteSettings, { 'POST /v1/chat': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 } });
});

test('the analysis role trusts only the listed principals', options, () => {
  const [role, ...others] = analysisRoles(templates.backoffice);
  assert.equal(others.length, 0);
  assert.deepEqual(role.Properties.AssumeRolePolicyDocument.Statement.map(statement => statement.Principal), [{ AWS: curator }]);
  assert.doesNotMatch(JSON.stringify(role), /:root/);
});

test('without listed principals the analysis role is not created', options, async () => {
  const { backoffice } = await synth('');
  assert.equal(analysisRoles(backoffice).length, 0);
  assert.ok(resources(backoffice, 'AWS::Lambda::Function').length > 0);
});

test('account roots, wildcards and other accounts are refused', options, async () => {
  for (const arn of [`arn:aws:iam::${account}:root`, `arn:aws:iam::${account}:role/*`, 'arn:aws:iam::999999999999:role/blu-curator']) {
    await assert.rejects(synth(arn), /BACKOFFICE_TRUSTED_PRINCIPAL_ARNS/, arn);
  }
});
