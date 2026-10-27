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
const siteBuilt = existsSync(path.join(infraDir, '../frontend/blu-cloud-site/dist/client/index.html'));

// Sem semente: o teste não depende do arquivo local de dados, que fica fora do Git.
async function portalTemplate() {
  const outdir = await mkdtemp(path.join(tmpdir(), 'blu-portal-'));
  try {
    await promisify(execFile)(process.execPath, ['aws-split-app.mjs'], {
      cwd: infraDir,
      env: { ...process.env, TARGET_AWS_ACCOUNT_ID: '123456789012', TARGET_AWS_REGION: 'eu-west-1', CDK_OUTDIR: outdir, PORTAL_SEED_ARCHIVE: path.join(outdir, 'missing.tgz'), CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:disable-asset-staging': true }) },
    });
    return JSON.parse(await readFile(path.join(outdir, 'BluCostaPortal.template.json'), 'utf8'));
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

test('o portal fica num servidor privado, só alcançável pelo CloudFront e com o login da equipa', { skip: !siteBuilt && 'build frontend/blu-cloud-site first' }, async () => {
  const template = await portalTemplate();
  const of = type => Object.values(template.Resources).filter(resource => resource.Type === type);
  const json = value => JSON.stringify(value);

  // Servidor sem IP público, na sub-rede isolada da VPC de dados, com IMDSv2 e discos cifrados.
  const [server] = of('AWS::EC2::Instance');
  const [nic] = server.Properties.NetworkInterfaces;
  assert.match(json(nic.SubnetId), /BluCostaData.*CloudUniverseVpcbackofficeisolatedSubnet1/);
  assert.equal(nic.AssociatePublicIpAddress, false);
  assert.equal(server.Properties.BlockDeviceMappings[0].Ebs.Encrypted, true);
  const [launchTemplate] = of('AWS::EC2::LaunchTemplate');
  assert.equal(launchTemplate.Properties.LaunchTemplateData.MetadataOptions.HttpTokens, 'required');
  // O internet gateway só existe para a VPC origin: nenhuma rota nem NAT o usa.
  assert.equal(of('AWS::EC2::VPCGatewayAttachment').length, 1);
  assert.equal(of('AWS::EC2::Route').length, 0);
  assert.equal(of('AWS::EC2::NatGateway').length, 0);
  assert.deepEqual(of('AWS::EC2::VPCEndpoint').map(endpoint => endpoint.Properties.VpcEndpointType ?? 'Gateway'), ['Gateway', 'Gateway']);
  assert.ok(of('AWS::CloudFront::Distribution')[0].DependsOn.includes('PortalOriginGatewayAttachment'));

  // Só o CloudFront entra (porta do portão); só o S3 e o DynamoDB saem.
  // Única entrada: o grupo que o CloudFront cria para a VPC origin, consultado depois da distribuição.
  const serverGroup = of('AWS::EC2::SecurityGroup').find(group => group.Properties.GroupDescription.startsWith('Portal:'));
  const ingress = [...(serverGroup.Properties.SecurityGroupIngress ?? []), ...of('AWS::EC2::SecurityGroupIngress').map(rule => rule.Properties)];
  assert.equal(ingress.length, 1);
  assert.deepEqual([ingress[0].FromPort, ingress[0].ToPort, ingress[0].CidrIp], [8080, 8080, undefined]);
  assert.match(json(ingress[0].SourceSecurityGroupId), /PortalOriginGroup/);
  assert.deepEqual(of('AWS::EC2::SecurityGroupEgress').map(rule => rule.Properties.DestinationPrefixListId).sort(), ['pl-6da54004', 'pl-6fa54006']);

  // Dados num disco próprio, cifrado, mantido se a stack for apagada e com cópia diária.
  const [volume] = of('AWS::EC2::Volume');
  assert.equal(volume.Properties.Encrypted, true);
  assert.equal(volume.DeletionPolicy, 'Retain');
  assert.match(json(volume.Properties.Tags), /"blu-backup".*"portal-state"/);
  const [backup] = of('AWS::DLM::LifecyclePolicy');
  assert.equal(backup.Properties.PolicyDetails.Schedules[0].RetainRule.Count, 7);

  // CloudFront → VPC origin, HTTPS obrigatório e sem cache para páginas com dados de clientes.
  const [distribution] = of('AWS::CloudFront::Distribution');
  const config = distribution.Properties.DistributionConfig;
  assert.ok(config.Origins[0].VpcOriginConfig);
  assert.equal(config.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https');
  assert.equal(config.DefaultCacheBehavior.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
  const [vpcOrigin] = of('AWS::CloudFront::VpcOrigin');
  assert.equal(vpcOrigin.Properties.VpcOriginEndpointConfig.HTTPPort, 8080);

  // Cliente Cognito do portal, no grupo da intranet, só com código + PKCE e as rotas do portão.
  const [client] = of('AWS::Cognito::UserPoolClient');
  assert.equal(client.Properties.GenerateSecret, false);
  assert.deepEqual(client.Properties.AllowedOAuthFlows, ['code']);
  assert.match(json(client.Properties.CallbackURLs), /\/auth\/callback"/);
  assert.match(json(client.Properties.LogoutURLs), /\/auth\/signed-out"/);
  assert.equal(of('AWS::Cognito::ManagedLoginBranding').length, 1);

  // A configuração do portão não apaga as versões publicadas; o servidor não escreve no S3 nem apaga dados.
  const [gateConfig] = of('Custom::CDKBucketDeployment');
  assert.equal(gateConfig.Properties.Prune, false);
  const serverPolicy = of('AWS::IAM::Policy').find(policy => json(policy.Properties.Roles).includes('PortalServerRole'));
  const actions = json(serverPolicy.Properties.PolicyDocument);
  assert.doesNotMatch(actions, /s3:Put|s3:Delete|dynamodb:(Scan|DeleteItem|PutItem|BatchWriteItem)|dynamodb:\*/);
  assert.match(actions, /dynamodb:Query/);

  // Build ARM no CodeBuild, lançado em cada deploy com código novo.
  const [build] = of('AWS::CodeBuild::Project');
  assert.equal(build.Properties.Environment.Type, 'ARM_CONTAINER');
  assert.equal(build.Properties.SecondarySources.length, 7);
  // O contorno do mapa (dashboard/region.geojson) vai no pacote: sem ele o Observatório e o mapa da proposta falham.
  assert.match(build.Properties.Source.BuildSpec, /region\.geojson/);
  // A ligação «Intranet» vem do output IntranetUrl, lido no build com permissão só de leitura.
  assert.match(build.Properties.Source.BuildSpec, /NEXT_PUBLIC_INTRANET_URL=.*IntranetUrl/);
  const buildPolicy = json(of('AWS::IAM::Policy').find(policy => json(policy.Properties.Roles).includes('PortalBuildRole')).Properties.PolicyDocument);
  assert.match(buildPolicy, /cloudformation:DescribeStacks/);
  assert.doesNotMatch(buildPolicy, /cloudformation:(Update|Create|Delete)/);
  assert.match(build.Properties.Source.BuildSpec, /sha256sum -c/);
  assert.equal(of('Custom::AWS').length, 2);
});
