import test from 'node:test';
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

// Sintetiza a aplicação sem copiar recursos e devolve o template do Backoffice.
async function synthBackoffice(trusted) {
  const outdir = await mkdtemp(path.join(tmpdir(), 'blu-synth-'));
  try {
    await promisify(execFile)(process.execPath, ['aws-split-app.mjs'], {
      cwd: infraDir,
      env: { ...process.env, TARGET_AWS_ACCOUNT_ID: account, TARGET_AWS_REGION: 'eu-west-1', CDK_OUTDIR: outdir, BACKOFFICE_TRUSTED_PRINCIPAL_ARNS: trusted, CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:disable-asset-staging': true }) },
    });
    return JSON.parse(await readFile(path.join(outdir, 'BluCostaBackoffice.template.json'), 'utf8'));
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

const analysisRoles = template => Object.values(template.Resources).filter(resource => resource.Type === 'AWS::IAM::Role' && resource.Properties.Description?.startsWith('Backoffice conversation analysis'));

test('the analysis role trusts only the listed principals', { skip: !siteBuilt && 'build frontend/blu-cloud-site first' }, async () => {
  const [role, ...others] = analysisRoles(await synthBackoffice(curator));
  assert.equal(others.length, 0);
  assert.deepEqual(role.Properties.AssumeRolePolicyDocument.Statement.map(statement => statement.Principal), [{ AWS: curator }]);
  assert.doesNotMatch(JSON.stringify(role), /:root/);
});

test('without listed principals the analysis role is not created', { skip: !siteBuilt && 'build frontend/blu-cloud-site first' }, async () => {
  const template = await synthBackoffice('');
  assert.equal(analysisRoles(template).length, 0);
  assert.ok(Object.values(template.Resources).some(resource => resource.Type === 'AWS::Lambda::Function'));
});

test('account roots, wildcards and other accounts are refused', { skip: !siteBuilt && 'build frontend/blu-cloud-site first' }, async () => {
  for (const arn of [`arn:aws:iam::${account}:root`, `arn:aws:iam::${account}:role/*`, 'arn:aws:iam::999999999999:role/blu-curator']) {
    await assert.rejects(synthBackoffice(arn), /BACKOFFICE_TRUSTED_PRINCIPAL_ARNS/, arn);
  }
});
