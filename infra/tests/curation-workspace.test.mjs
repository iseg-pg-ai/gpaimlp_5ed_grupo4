import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const infra = path.resolve(import.meta.dirname, "..");
const cdk = path.join(infra, "node_modules", ".bin", "cdk");
const environment = {
  ...process.env,
  TARGET_AWS_ACCOUNT_ID: "650557269385",
  TARGET_AWS_REGION: "eu-west-1",
  DEPLOY_ENVIRONMENT: "staging",
  BLU_PUBLIC_DOMAIN: "example.test",
  BLU_CURATION_IMAGE_URI:
    `650557269385.dkr.ecr.eu-west-1.amazonaws.com/blu-curation@sha256:${"a".repeat(64)}`,
  BLU_CERTIFICATE_ARN:
    "arn:aws:acm:eu-west-1:650557269385:certificate/00000000-0000-4000-8000-000000000000",
  BLU_DATA_BUCKET_NAME: "blu-dmc-data-650557269385-eu-west-1",
  BLU_BACKUP_BUCKET_NAME: "blu-dmc-backups-650557269385-eu-west-1",
  BLU_MONITORING_SNS_TOPIC_ARN:
    "arn:aws:sns:eu-west-1:650557269385:blu-monitoring-development",
  BLU_AGENT_PROVIDER: "bedrock",
  BEDROCK_MODEL_ID: "eu.amazon.nova-pro-v1:0",
  BLU_AGENT_MONTHLY_BUDGET_USD: "25",
  BLU_AGENT_RATES_JSON: JSON.stringify({
    "eu.amazon.nova-pro-v1:0": { input: 1, output: 2 },
  }),
};

function synth(t) {
  const output = mkdtempSync(path.join(tmpdir(), "blu-curation-cdk-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const result = spawnSync(
    cdk,
    [
      "synth",
      "--app",
      "node curation-workspace.mjs",
      "--output",
      output,
      "--quiet",
    ],
    { cwd: infra, env: environment, encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const filename = readdirSync(output).find((name) =>
    name.endsWith("template.json"),
  );
  assert.ok(filename);
  return JSON.parse(readFileSync(path.join(output, filename), "utf8"));
}

test("stack do Curation Studio mantém uma escritora e persistência retida", (t) => {
  const template = synth(t);
  const resources = Object.values(template.Resources);
  const ofType = (type) =>
    resources.filter((resource) => resource.Type === type);

  assert.equal(ofType("AWS::ECS::Service").length, 1);
  assert.equal(ofType("AWS::ECS::Service")[0].Properties.DesiredCount, 1);
  const task = ofType("AWS::ECS::TaskDefinition")[0];
  assert.equal(task.Properties.ContainerDefinitions.length, 4);
  assert.equal(task.Properties.NetworkMode, "awsvpc");
  for (const container of task.Properties.ContainerDefinitions)
    assert.ok(JSON.stringify(container.Image).includes(`@sha256:${"a".repeat(64)}`));
  assert.equal(template.Outputs.ImageUri.Value, environment.BLU_CURATION_IMAGE_URI);

  const fileSystem = ofType("AWS::EFS::FileSystem")[0];
  assert.equal(fileSystem.Properties.Encrypted, true);
  assert.equal(fileSystem.DeletionPolicy, "Retain");
  assert.equal(ofType("AWS::EC2::NatGateway").length, 0);
});

test("stack protege interfaces com TLS, Cognito e grupos aprovados", (t) => {
  const template = synth(t);
  const resources = Object.values(template.Resources);
  const listeners = resources.filter(
    (resource) => resource.Type === "AWS::ElasticLoadBalancingV2::Listener",
  );
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].Properties.Port, 443);
  assert.equal(listeners[0].Properties.Protocol, "HTTPS");
  assert.equal(
    resources.filter(
      (resource) => resource.Type === "AWS::Cognito::UserPoolGroup",
    ).length,
    4,
  );
  assert.equal(
    resources.filter(
      (resource) => resource.Type === "AWS::SecretsManager::Secret",
    ).length,
    1,
  );
  const separateIngress = resources
    .filter((resource) => resource.Type === "AWS::EC2::SecurityGroupIngress")
    .filter((resource) => resource.Properties.CidrIp === "0.0.0.0/0");
  const inlineIngress = resources
    .filter((resource) => resource.Type === "AWS::EC2::SecurityGroup")
    .flatMap((resource) => resource.Properties.SecurityGroupIngress ?? [])
    .filter((rule) => rule.CidrIp === "0.0.0.0/0");
  const publicIngress = [
    ...separateIngress.map((rule) => rule.Properties),
    ...inlineIngress,
  ];
  assert.deepEqual(
    publicIngress.map((rule) => rule.FromPort),
    [443],
  );
  const portal = resources
    .find((resource) => resource.Type === "AWS::ECS::TaskDefinition")
    .Properties.ContainerDefinitions.find((container) => container.Name === "portal");
  const variables = Object.fromEntries(portal.Environment.map(({ Name, Value }) => [Name, Value]));
  assert.equal(variables.BLU_IDENTITY_MODE, "alb-cognito");
  assert.ok(variables.BLU_ALB_ARN);
  assert.ok(variables.BLU_COGNITO_USER_POOL_ID);
  assert.ok(variables.BLU_COGNITO_CLIENT_ID);
  assert.equal(variables.BLU_AGENT_PROVIDER, "bedrock");
  assert.equal(variables.BEDROCK_MODEL_ID, "eu.amazon.nova-pro-v1:0");
  assert.equal(variables.BLU_AGENT_MONTHLY_BUDGET_USD, "25");
});

test("configuração recusa tags, digests inválidos e ECR fora da conta ou região", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  for (const image of [
    "public.example/blu:latest",
    "650557269385.dkr.ecr.eu-west-1.amazonaws.com/blu-curation:latest",
    "650557269385.dkr.ecr.eu-west-1.amazonaws.com/blu-curation@sha256:abc",
    `650557269385.dkr.ecr.eu-west-1.amazonaws.com/blu-curation@sha256:${"g".repeat(64)}`,
    `999999999999.dkr.ecr.eu-west-1.amazonaws.com/blu-curation@${digest}`,
    `650557269385.dkr.ecr.us-east-1.amazonaws.com/blu-curation@${digest}`,
  ]) {
    const result = spawnSync("node", ["curation-workspace.mjs"], {
      cwd: infra,
      env: { ...environment, BLU_CURATION_IMAGE_URI: image },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.notEqual(result.status, 0, image);
    assert.match(result.stderr, /pinned by sha256 digest/);
  }
});
