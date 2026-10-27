import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePolicies } from './policy/checks.mjs';
import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Size,
  Stack,
  Tags,
  aws_apigatewayv2 as apigatewayv2,
  aws_apigatewayv2_integrations as integrations,
  aws_bedrock as bedrock,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_codebuild as codebuild,
  aws_dlm as dlm,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as eventSources,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_assets as s3assets,
  aws_s3_deployment as s3deploy,
  aws_apigatewayv2_authorizers as authorizers,
  aws_cognito as cognito,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
  custom_resources as cr,
} from 'aws-cdk-lib';

// Separate deployment units for the public chatbot and the curator/backoffice.
// The data stack is the only shared contract: the frontend can publish events,
// while the backoffice owns read/analysis permissions.
const account = process.env.TARGET_AWS_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.TARGET_AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'eu-west-1';
const environmentName = process.env.DEPLOY_ENVIRONMENT ?? 'pilot';
const projectName = process.env.PROJECT_NAME ?? 'blu-costa';
const outdir = process.env.CDK_OUTDIR ?? 'cdk.split.out';
const infraDir = path.dirname(fileURLToPath(import.meta.url));
// The polished BLU site is the public root; the compact channel bridge remains
// available under /connect for campaign and WhatsApp hand-offs.
const siteAsset = path.resolve(infraDir, '../frontend/blu-cloud-site/dist/client');
const socialBridgeAsset = path.resolve(infraDir, '../frontend/website');
const intranetAsset = path.resolve(infraDir, '../frontend/intranet');
const governanceControls = JSON.parse(readFileSync(path.resolve(infraDir, '../config/governance-controls.json'), 'utf8'));
const partnersConfig = JSON.parse(readFileSync(path.resolve(infraDir, '../config/partners.json'), 'utf8'));
// Políticas como código: uma regra bloqueante em falha impede o synth e, portanto, o deploy.
const policyReport = evaluatePolicies();
if (policyReport.summary.blockingFailures.length) throw new Error(`Blocking policy failures: ${policyReport.summary.blockingFailures.join(', ')} (see config/policies.json)`);
if (!/^[0-9]{12}$/.test(account ?? '')) throw new Error('TARGET_AWS_ACCOUNT_ID must be the twelve-digit destination AWS account');

const app = new App({ outdir });
const env = { account, region };
const tag = stack => {
  Tags.of(stack).add('Project', projectName);
  Tags.of(stack).add('Environment', environmentName);
  Tags.of(stack).add('ManagedBy', 'aws-cdk');
};

// Login gerido com a marca BLU: cada cliente Cognito precisa do seu estilo.
// Imagens copiadas do site público (logótipo e fotografia do farol) e cores da intranet.
function brandLogin(scope, id, userPool, client) {
  const loginAsset = (file, category, extension) => ({ category, extension, colorMode: 'LIGHT', bytes: readFileSync(path.join(infraDir, 'assets/login', file)).toString('base64') });
  return new cognito.CfnManagedLoginBranding(scope, id, {
    userPoolId: userPool.userPoolId,
    clientId: client.userPoolClientId,
    returnMergedResources: false,
    assets: [loginAsset('logo.png', 'FORM_LOGO', 'PNG'), loginAsset('background.jpg', 'PAGE_BACKGROUND', 'JPEG')],
    settings: {
      categories: { global: { colorSchemeMode: 'LIGHT' } },
      components: {
        pageBackground: { image: { enabled: true }, lightMode: { color: '163b45ff' } },
        form: {
          borderRadius: 10,
          logo: { enabled: true, location: 'CENTER', position: 'TOP', formInclusion: 'IN' },
          lightMode: { backgroundColor: 'fffdf9ff', borderColor: 'e2d9c9ff' },
        },
        primaryButton: {
          lightMode: {
            defaults: { backgroundColor: '163b45ff', textColor: 'ffffffff' },
            hover: { backgroundColor: '102f38ff', textColor: 'ffffffff' },
            active: { backgroundColor: '102f38ff', textColor: 'ffffffff' },
          },
        },
      },
    },
  });
}

class DataStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tag(this);
    this.vpc = new ec2.Vpc(this, 'CloudUniverseVpc', {
      ipAddresses: ec2.IpAddresses.cidr(process.env.CLOUD_VPC_CIDR ?? '10.10.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'backoffice-isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.messages = new dynamodb.Table(this, 'ConversationMessages', {
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'occurredAtId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.messages.addGlobalSecondaryIndex({ indexName: 'LeadIndex', partitionKey: { name: 'leadId', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'occurredAtId', type: dynamodb.AttributeType.STRING }, projectionType: dynamodb.ProjectionType.ALL });
    this.intelligence = new dynamodb.Table(this, 'CustomerIntelligence', {
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.intelligence.addGlobalSecondaryIndex({
      indexName: 'FollowUpIndex',
      partitionKey: { name: 'followUpStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'followUpAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.archive = new s3.Bucket(this, 'ConversationArchive', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ id: 'ExpireRawSessionArchive', prefix: 'sessions/', expiration: Duration.days(90) }],
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    this.whatsappSecret = process.env.WHATSAPP_SECRET_ARN
      ? secretsmanager.Secret.fromSecretCompleteArn(this, 'ImportedWhatsAppChannelSecret', process.env.WHATSAPP_SECRET_ARN)
      : new secretsmanager.Secret(this, 'WhatsAppChannelSecret', {
          description: 'Server-only Meta WhatsApp Cloud API configuration. Replace placeholder values before enabling the webhook.',
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              appSecret: 'SET_IN_SECRETS_MANAGER',
              accessToken: 'SET_IN_SECRETS_MANAGER',
              phoneNumberId: 'SET_IN_SECRETS_MANAGER',
              graphApiVersion: 'SET_IN_SECRETS_MANAGER',
            }),
            generateStringKey: 'verifyToken',
            passwordLength: 48,
            excludePunctuation: true,
          },
        });
    this.deadLetter = new sqs.Queue(this, 'ConversationEventsDlq', { encryption: sqs.QueueEncryption.SQS_MANAGED, retentionPeriod: Duration.days(14) });
    this.events = new sqs.Queue(this, 'ConversationEvents', { encryption: sqs.QueueEncryption.SQS_MANAGED, visibilityTimeout: Duration.seconds(60), deadLetterQueue: { queue: this.deadLetter, maxReceiveCount: 3 } });
    this.crmEvents = new sqs.Queue(this, 'BackofficeCrmEvents', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.seconds(60),
    });
    new CfnOutput(this, 'ConversationTableName', { value: this.messages.tableName, exportName: `${projectName}-${environmentName}-conversation-table` });
    new CfnOutput(this, 'CustomerIntelligenceTableName', { value: this.intelligence.tableName, exportName: `${projectName}-${environmentName}-customer-intelligence` });
    new CfnOutput(this, 'ConversationEventsQueueUrl', { value: this.events.queueUrl, exportName: `${projectName}-${environmentName}-conversation-events` });
    new CfnOutput(this, 'BackofficeCrmQueueUrl', { value: this.crmEvents.queueUrl, exportName: `${projectName}-${environmentName}-crm-events` });
    new CfnOutput(this, 'ConversationArchiveBucket', { value: this.archive.bucketName, exportName: `${projectName}-${environmentName}-conversation-archive` });
    new CfnOutput(this, 'WhatsAppChannelSecretArn', { value: this.whatsappSecret.secretArn });
    new CfnOutput(this, 'CloudUniverseVpcId', { value: this.vpc.vpcId, exportName: `${projectName}-${environmentName}-vpc` });
    new CfnOutput(this, 'BackofficeSubnetIds', { value: this.vpc.isolatedSubnets.map(subnet => subnet.subnetId).join(',') });
  }
}

class FrontendStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tag(this);

    const guardrailProfileArn = process.env.BEDROCK_GUARDRAIL_PROFILE_ARN;
    if (guardrailProfileArn && !/^arn:aws(-[^:]+)?:bedrock:[a-z0-9-]{1,20}:[0-9]{12}:guardrail-profile\/[a-z0-9-]+\.guardrail\.v[0-9:]+$/.test(guardrailProfileArn)) {
      throw new Error('BEDROCK_GUARDRAIL_PROFILE_ARN is not a valid cross-Region guardrail profile ARN');
    }
    const filtersConfig = ['HATE', 'INSULTS', 'SEXUAL', 'VIOLENCE', 'MISCONDUCT'].map(type => ({
      type,
      inputStrength: 'MEDIUM',
      outputStrength: 'MEDIUM',
      inputAction: 'BLOCK',
      outputAction: 'BLOCK',
      inputEnabled: true,
      outputEnabled: true,
    }));
    filtersConfig.push({
      type: 'PROMPT_ATTACK',
      inputStrength: 'HIGH',
      outputStrength: 'NONE',
      inputAction: 'BLOCK',
      outputAction: 'NONE',
      inputEnabled: true,
      outputEnabled: false,
    });
    const guardrail = new bedrock.CfnGuardrail(this, 'ChatGuardrail', {
      name: `${projectName}-${environmentName}-chat`,
      description: 'Protect the public BLU travel concierge from unsafe content and prompt extraction.',
      blockedInputMessaging: 'I can help with destinations, dates, preferences and planning a private journey through Portugal.',
      blockedOutputsMessaging: 'I can help with destinations, dates, preferences and planning a private journey through Portugal.',
      contentPolicyConfig: {
        filtersConfig,
        ...(guardrailProfileArn ? { contentFiltersTierConfig: { tierName: 'STANDARD' } } : {}),
      },
      ...(guardrailProfileArn ? { crossRegionConfig: { guardrailProfileArn } } : {}),
    });
    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'ChatGuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Immutable version used by the public chatbot Lambda.',
    });

    const ingest = new lambda.Function(this, 'ConversationIngest', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { QUEUE_URL: props.data.events.queueUrl },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/ingest')),
    });
    props.data.events.grantSendMessages(ingest);

    const processor = new lambda.Function(this, 'ConversationEventProcessor', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        TABLE_NAME: props.data.messages.tableName,
        INTELLIGENCE_TABLE_NAME: props.data.intelligence.tableName,
        ARCHIVE_BUCKET: props.data.archive.bucketName,
        CRM_QUEUE_URL: props.data.crmEvents.queueUrl,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/event-processor')),
    });
    processor.addEventSource(new eventSources.SqsEventSource(props.data.events, {
      batchSize: 10,
      reportBatchItemFailures: true,
    }));
    props.data.messages.grantWriteData(processor);
    props.data.intelligence.grantReadWriteData(processor);
    props.data.archive.grantPut(processor, 'sessions/*');
    props.data.crmEvents.grantSendMessages(processor);

    const chat = new lambda.Function(this, 'BedrockChat', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        // Nova 2 Lite é o modelo publicado em eu-west-1 desde 2026-10-25; a predefinição evita regressões ao publicar.
        MODEL_ID: process.env.BEDROCK_MODEL_ID ?? (region === 'eu-west-1' ? 'eu.amazon.nova-2-lite-v1:0' : 'amazon.nova-lite-v1:0'),
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: guardrailVersion.attrVersion,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/chat')),
    });
    chat.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel', 'bedrock:ApplyGuardrail'], resources: ['*'] }));

    const whatsappWebhook = new lambda.Function(this, 'WhatsAppWebhook', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        QUEUE_URL: props.data.events.queueUrl,
        WHATSAPP_SECRET_ARN: props.data.whatsappSecret.secretArn,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/whatsapp-webhook')),
    });
    props.data.whatsappSecret.grantRead(whatsappWebhook);
    props.data.events.grantSendMessages(whatsappWebhook);

    const api = new apigatewayv2.HttpApi(this, 'PublicChatbotApi', { corsPreflight: { allowHeaders: ['content-type'], allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS], allowOrigins: ['*'] } });
    api.addRoutes({ path: '/v1/conversation-events', methods: [apigatewayv2.HttpMethod.POST], integration: new integrations.HttpLambdaIntegration('ConversationIngestIntegration', ingest) });
    api.addRoutes({ path: '/v1/chat', methods: [apigatewayv2.HttpMethod.POST], integration: new integrations.HttpLambdaIntegration('BedrockChatIntegration', chat) });
    api.addRoutes({ path: '/v1/channels/whatsapp', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: new integrations.HttpLambdaIntegration('WhatsAppWebhookIntegration', whatsappWebhook) });
    // The routes are public, so cap request rates on the existing default stage
    // (updated in place). Chat is tighter because every call is a paid Bedrock invocation.
    const defaultStage = api.defaultStage.node.defaultChild;
    defaultStage.defaultRouteSettings = { throttlingRateLimit: 10, throttlingBurstLimit: 20 };
    defaultStage.routeSettings = {
      // routeSettings is untyped JSON, so CloudFormation property casing is required here.
      'POST /v1/chat': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
    };

    const siteBucket = new s3.Bucket(this, 'FrontendSite', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) },
      ],
    });
    const whatsappNumber = process.env.WHATSAPP_PUBLIC_NUMBER ?? '351915784212';
    if (!/^\d{7,20}$/.test(whatsappNumber)) throw new Error('WHATSAPP_PUBLIC_NUMBER must contain international digits only');
    // index.html and config.js are not content-hashed, so browsers must revalidate them
    // (cheap 304s via ETag) or visitors keep a stale site for hours after a deploy.
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      sources: [
        s3deploy.Source.asset(siteAsset),
        s3deploy.Source.data('config.js', `window.BLU_CHAT_API=${JSON.stringify(`${api.apiEndpoint}/v1/chat`)};window.BLU_CONVERSATION_EVENTS_ENDPOINT=${JSON.stringify(`${api.apiEndpoint}/v1/conversation-events`)};window.BLU_WHATSAPP_URL=${JSON.stringify(`https://wa.me/${whatsappNumber}`)};`),
      ],
    });
    new s3deploy.BucketDeployment(this, 'DeploySocialConversationBridge', {
      destinationBucket: siteBucket,
      destinationKeyPrefix: 'connect',
      distribution,
      distributionPaths: ['/connect/*'],
      prune: false,
      cacheControl: [s3deploy.CacheControl.noCache()],
      sources: [
        s3deploy.Source.asset(socialBridgeAsset),
        s3deploy.Source.data('config.js', `window.BLU_CHAT_API=${JSON.stringify(`${api.apiEndpoint}/v1/chat`)};window.BLU_CONVERSATION_EVENTS_ENDPOINT=${JSON.stringify(`${api.apiEndpoint}/v1/conversation-events`)};window.BLU_WHATSAPP_URL=${JSON.stringify(`https://wa.me/${whatsappNumber}`)};`),
      ],
    });

    new CfnOutput(this, 'ConversationEventsEndpoint', { value: `${api.apiEndpoint}/v1/conversation-events` });
    new CfnOutput(this, 'ChatEndpoint', { value: `${api.apiEndpoint}/v1/chat` });
    new CfnOutput(this, 'WhatsAppWebhookEndpoint', { value: `${api.apiEndpoint}/v1/channels/whatsapp` });
    new CfnOutput(this, 'FrontendUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'SocialConversationBridgeUrl', { value: `https://${distribution.distributionDomainName}/connect/index/index.html` });
    new CfnOutput(this, 'FrontendBucketName', { value: siteBucket.bucketName });
    new CfnOutput(this, 'FrontendContract', { value: 'POST journeyConsent=true, analyticsConsent, conversationId, leadId?, message={actor,channel,text}' });
  }
}

class BackofficeStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tag(this);
    const exportsBucket = new s3.Bucket(this, 'AnalysisExports', { encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, versioned: true, removalPolicy: RemovalPolicy.RETAIN, autoDeleteObjects: false });
    const evidenceBucket = new s3.Bucket(this, 'GovernanceEvidence', { encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, versioned: true, removalPolicy: RemovalPolicy.RETAIN, autoDeleteObjects: false });
    const whatsappOutbound = new lambda.Function(this, 'WhatsAppOutbound', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(20),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        QUEUE_URL: props.data.events.queueUrl,
        WHATSAPP_SECRET_ARN: props.data.whatsappSecret.secretArn,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/whatsapp-outbound')),
    });
    props.data.whatsappSecret.grantRead(whatsappOutbound);
    props.data.events.grantSendMessages(whatsappOutbound);

    const rag = new lambda.Function(this, 'BackofficeRag', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        MESSAGE_TABLE_NAME: props.data.messages.tableName,
        INTELLIGENCE_TABLE_NAME: props.data.intelligence.tableName,
        KNOWLEDGE_BUCKET: props.data.archive.bucketName,
        MODEL_ID: process.env.BEDROCK_BACKOFFICE_MODEL_ID ?? (region === 'eu-west-1' ? 'eu.amazon.nova-lite-v1:0' : 'amazon.nova-lite-v1:0'),
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/backoffice-rag')),
    });
    props.data.messages.grantReadData(rag);
    props.data.intelligence.grantReadData(rag);
    props.data.archive.grantRead(rag, 'curated/approved/*');
    rag.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: ['*'] }));

    // Only named BLU principals may assume the analysis role: trusting the whole account
    // would also admit shared roles such as the course's SageMaker execution role.
    const trustedPrincipals = (process.env.BACKOFFICE_TRUSTED_PRINCIPAL_ARNS ?? '').split(',').map(arn => arn.trim()).filter(Boolean);
    const principalPattern = new RegExp(`^arn:aws:iam::${account}:(role|user)/[\\w+=,.@/-]+$`);
    const invalidPrincipal = trustedPrincipals.find(arn => !principalPattern.test(arn));
    if (invalidPrincipal) throw new Error(`BACKOFFICE_TRUSTED_PRINCIPAL_ARNS must list role or user ARNs in account ${account}, not ${invalidPrincipal}`);
    if (trustedPrincipals.length) {
      const analysisRole = new iam.Role(this, 'BackofficeAnalysisRole', { assumedBy: new iam.CompositePrincipal(...trustedPrincipals.map(arn => new iam.ArnPrincipal(arn))), description: 'Backoffice conversation analysis and explicitly approved channel dispatch' });
      props.data.messages.grantReadData(analysisRole);
      props.data.intelligence.grantReadWriteData(analysisRole);
      props.data.archive.grantRead(analysisRole, 'sessions/*', 'curated/*');
      props.data.crmEvents.grantConsumeMessages(analysisRole);
      whatsappOutbound.grantInvoke(analysisRole);
      rag.grantInvoke(analysisRole);
      new CfnOutput(this, 'BackofficeAnalysisRoleArn', { value: analysisRole.roleArn });
    }

    const churnEvaluator = new lambda.Function(this, 'ChurnFollowUpEvaluator', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(60),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        INTELLIGENCE_TABLE_NAME: props.data.intelligence.tableName,
        CRM_QUEUE_URL: props.data.crmEvents.queueUrl,
        EVIDENCE_BUCKET: evidenceBucket.bucketName,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/churn-evaluator')),
    });
    props.data.intelligence.grantReadWriteData(churnEvaluator);
    props.data.crmEvents.grantSendMessages(churnEvaluator);
    evidenceBucket.grantPut(churnEvaluator, 'controls/churn-followups/*');
    new events.Rule(this, 'DailyChurnReview', {
      description: 'Creates curator review tasks for due follow-ups; never contacts customers automatically.',
      schedule: events.Schedule.rate(Duration.days(1)),
      targets: [new targets.LambdaFunction(churnEvaluator)],
    });

    new s3deploy.BucketDeployment(this, 'DeployGovernanceControlManifest', {
      destinationBucket: evidenceBucket,
      destinationKeyPrefix: 'controls/manifests',
      prune: false,
      // Fonte única: config/governance-controls.json, também apresentada na intranet.
      sources: [
        s3deploy.Source.data('customer-intelligence-controls.json', JSON.stringify(governanceControls, null, 2)),
        s3deploy.Source.data('policy-report.json', JSON.stringify(policyReport, null, 2)),
      ],
    });
    new CfnOutput(this, 'ConversationTableForBackoffice', { value: props.data.messages.tableName });
    new CfnOutput(this, 'AnalysisExportBucket', { value: exportsBucket.bucketName });
    new CfnOutput(this, 'GovernanceEvidenceBucket', { value: evidenceBucket.bucketName });
    new CfnOutput(this, 'BackofficeRagFunctionArn', { value: rag.functionArn });
    new CfnOutput(this, 'ChurnEvaluatorFunctionArn', { value: churnEvaluator.functionArn });
    new CfnOutput(this, 'BackofficeCrmQueueUrl', { value: props.data.crmEvents.queueUrl });
    new CfnOutput(this, 'WhatsAppOutboundFunctionArn', { value: whatsappOutbound.functionArn });
    this.rag = rag;
    this.whatsappOutbound = whatsappOutbound;
    this.evidenceBucket = evidenceBucket;
  }
}

// Intranet da equipa: login Cognito com MFA, API protegida por JWT e site estático privado.
// Só lê e atualiza os registos PROFILE já existentes; não cria tabelas nem contacta clientes.
class IntranetStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tag(this);
    const { data, backoffice } = props;

    const userPool = new cognito.UserPool(this, 'IntranetUsers', {
      userPoolName: `${projectName}-${environmentName}-intranet`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true } },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    for (const [group, description] of [['founders', 'Fundadores: tudo, incluindo gestão de acessos'], ['curators', 'Seguimento de leads, agenda e parceiros'], ['governance', 'Governança e evidências (leitura)'], ['testers', 'Equipa de testes (leitura)']]) {
      new cognito.CfnUserPoolGroup(this, `Group-${group}`, { userPoolId: userPool.userPoolId, groupName: group, description });
    }
    const domainPrefix = process.env.INTRANET_AUTH_DOMAIN_PREFIX ?? `${projectName}-${environmentName}-intranet-${account.slice(-4)}`;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domainPrefix)) throw new Error('INTRANET_AUTH_DOMAIN_PREFIX must be lowercase letters, digits and hyphens');
    // Login gerido (versão 2): permite logótipo e fundo da marca; o texto fica em inglês.
    const loginDomain = userPool.addDomain('IntranetLogin', { cognitoDomain: { domainPrefix }, managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN });
    const authHost = `${domainPrefix}.auth.${region}.amazoncognito.com`;

    const siteBucket = new s3.Bucket(this, 'IntranetSite', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const api = new apigatewayv2.HttpApi(this, 'IntranetApi', { description: 'BLU staff intranet API (Cognito JWT)' });
    // A CSP não referencia o endereço exato da API: a API já depende do domínio
    // da distribuição (CORS), e a referência inversa criaria um ciclo no CloudFormation.
    const siteHeaders = new cloudfront.ResponseHeadersPolicy(this, 'IntranetHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.execute-api.${region}.amazonaws.com https://${authHost}; form-action 'self' https://${authHost}; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
      },
    });
    const siteOn = bucket => ({
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        responseHeadersPolicy: siteHeaders,
      },
    });
    const distribution = new cloudfront.Distribution(this, 'IntranetDistribution', siteOn(siteBucket));
    const siteUrl = `https://${distribution.distributionDomainName}/`;
    // Backoffice: endereço próprio para o trabalho com clientes, com o mesmo login, API e código da intranet.
    const backofficeBucket = new s3.Bucket(this, 'BackofficeSite', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    const backofficeDistribution = new cloudfront.Distribution(this, 'BackofficeDistribution', siteOn(backofficeBucket));
    const backofficeUrl = `https://${backofficeDistribution.distributionDomainName}/`;
    const extraCallbacks = (process.env.INTRANET_CALLBACK_URLS ?? '').split(',').map(url => url.trim()).filter(Boolean);
    const client = userPool.addClient('IntranetWeb', {
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [siteUrl, backofficeUrl, ...extraCallbacks],
        logoutUrls: [siteUrl, backofficeUrl, ...extraCallbacks],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
      preventUserExistenceErrors: true,
    });
    brandLogin(this, 'IntranetLoginBranding', userPool, client).node.addDependency(loginDomain);
    this.userPool = userPool;
    this.authHost = authHost;

    // WhatsApp em modo de teste por omissão: só INTRANET_WHATSAPP_MODE=live envia mensagens reais.
    const whatsappMode = process.env.INTRANET_WHATSAPP_MODE ?? 'test';
    if (!['test', 'live'].includes(whatsappMode)) throw new Error('INTRANET_WHATSAPP_MODE must be "test" or "live"');
    const fn = new lambda.Function(this, 'IntranetApiHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(29),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        MESSAGE_TABLE_NAME: data.messages.tableName,
        INTELLIGENCE_TABLE_NAME: data.intelligence.tableName,
        EVENTS_QUEUE_URL: data.events.queueUrl,
        CRM_QUEUE_URL: data.crmEvents.queueUrl,
        EVIDENCE_BUCKET: backoffice.evidenceBucket.bucketName,
        RAG_FUNCTION_NAME: backoffice.rag.functionName,
        USER_POOL_ID: userPool.userPoolId,
        PARTNERS_JSON: JSON.stringify({ partners: partnersConfig.partners }),
        MANAGED_SECRETS: JSON.stringify([{ arn: data.whatsappSecret.secretArn, purpose: 'WhatsApp Business (envio de lembretes e mensagens)' }]),
        WHATSAPP_MODE: whatsappMode,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/intranet')),
    });
    // Permissões explícitas e mínimas: sem Scan nem DeleteItem; PutItem só cria registos da agenda (com condição no código).
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query', 'dynamodb:GetItem'], resources: [data.messages.tableArn, data.intelligence.tableArn, `${data.intelligence.tableArn}/index/FollowUpIndex`] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:UpdateItem', 'dynamodb:PutItem'], resources: [data.intelligence.tableArn] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['sqs:GetQueueAttributes'], resources: [data.events.queueArn, data.crmEvents.queueArn, `arn:aws:sqs:${region}:${account}:BluCostaData-ConversationEventsDlq*`] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['lambda:ListFunctions', 'cloudwatch:GetMetricData'], resources: ['*'] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['cognito-idp:ListUsersInGroup', 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminRemoveUserFromGroup', 'cognito-idp:AdminEnableUser', 'cognito-idp:AdminDisableUser'], resources: [userPool.userPoolArn] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['secretsmanager:DescribeSecret'], resources: [data.whatsappSecret.secretArn] }));
    backoffice.evidenceBucket.grantRead(fn, 'controls/*');
    backoffice.rag.grantInvoke(fn);

    const authorizer = new authorizers.HttpJwtAuthorizer('IntranetJwt', `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}`, { jwtAudience: [client.userPoolClientId] });
    const integration = new integrations.HttpLambdaIntegration('IntranetIntegration', fn);
    const routes = [
      ['GET', '/v1/me'], ['GET', '/v1/leads'], ['GET', '/v1/leads/{id}'],
      ['POST', '/v1/leads/{id}/contacted'], ['POST', '/v1/leads/{id}/assign'], ['PUT', '/v1/leads/{id}/tags'], ['POST', '/v1/leads/{id}/ask'],
      ['GET', '/v1/metrics'], ['GET', '/v1/team'], ['GET', '/v1/operations'], ['GET', '/v1/governance'],
      ['GET', '/v1/alerts'], ['GET', '/v1/cases'], ['POST', '/v1/cases'], ['GET', '/v1/leads/{id}/cases'], ['GET', '/v1/leads/{id}/cases/{caseId}'], ['POST', '/v1/leads/{id}/cases/{caseId}'], ['GET', '/v1/security'],
      ['GET', '/v1/access'], ['POST', '/v1/team/invite'], ['POST', '/v1/team/{username}/role'], ['POST', '/v1/team/{username}/status'],
      ['GET', '/v1/partners'], ['GET', '/v1/agenda'], ['GET', '/v1/leads/{id}/activities'], ['POST', '/v1/leads/{id}/activities'], ['POST', '/v1/leads/{id}/activities/{activityId}/cancel'],
      ['GET', '/v1/work'], ['GET', '/v1/tasks'], ['POST', '/v1/tasks'], ['GET', '/v1/leads/{id}/tasks/{taskId}'], ['POST', '/v1/leads/{id}/tasks/{taskId}'], ['GET', '/v1/feed'],
      ['GET', '/v1/settings'], ['POST', '/v1/settings'], ['POST', '/v1/governance/attestations'],
      ['GET', '/v1/conversations'], ['GET', '/v1/leads/{id}/feedback'], ['POST', '/v1/leads/{id}/feedback'],
      ['GET', '/v1/whatsapp-test'], ['POST', '/v1/whatsapp-test'],
    ];
    for (const [method, routePath] of routes) {
      api.addRoutes({ path: routePath, methods: [apigatewayv2.HttpMethod[method]], integration, authorizer });
    }
    // CORS só dos domínios da intranet e do backoffice; limite de pedidos para conter abusos com um token roubado.
    const cfnApi = api.node.defaultChild;
    cfnApi.corsConfiguration = { allowOrigins: [`https://${distribution.distributionDomainName}`, `https://${backofficeDistribution.distributionDomainName}`], allowHeaders: ['authorization', 'content-type'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], maxAge: 600 };
    api.defaultStage.node.defaultChild.defaultRouteSettings = { throttlingBurstLimit: 40, throttlingRateLimit: 20 };

    // Lembretes agendados pelo curador: verificados a cada 5 minutos e enviados pelo
    // WhatsAppOutbound do Backoffice; sem credenciais ficam marcados como preparados.
    // Email (SES) e SMS (SNS) ficam desligados até haver remetente verificado e autorização de SMS.
    const emailFrom = process.env.INTRANET_EMAIL_FROM ?? '';
    if (emailFrom && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(emailFrom)) throw new Error('INTRANET_EMAIL_FROM must be a verified SES email address');
    const smsEnabled = process.env.INTRANET_SMS_ENABLED === 'true';
    const dispatcher = new lambda.Function(this, 'ScheduledNotifications', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dispatch.handler',
      timeout: Duration.seconds(60),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        INTELLIGENCE_TABLE_NAME: data.intelligence.tableName,
        MESSAGE_TABLE_NAME: data.messages.tableName,
        WHATSAPP_FUNCTION_NAME: backoffice.whatsappOutbound.functionName,
        EMAIL_FROM: emailFrom,
        SMS_ENABLED: smsEnabled ? 'true' : 'false',
        EVIDENCE_BUCKET: backoffice.evidenceBucket.bucketName,
        WHATSAPP_MODE: whatsappMode,
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/intranet')),
    });
    // Leitura das definições, dos leads e da conversa para as mensagens automáticas; PutItem só cria (condição no código).
    dispatcher.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query'], resources: [data.intelligence.tableArn, `${data.intelligence.tableArn}/index/FollowUpIndex`, data.messages.tableArn] }));
    dispatcher.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:UpdateItem', 'dynamodb:PutItem'], resources: [data.intelligence.tableArn] }));
    backoffice.whatsappOutbound.grantInvoke(dispatcher);
    if (emailFrom) dispatcher.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: [`arn:aws:ses:${region}:${account}:identity/${emailFrom.split('@')[1]}`, `arn:aws:ses:${region}:${account}:identity/${emailFrom}`] }));
    if (smsEnabled) dispatcher.addToRolePolicy(new iam.PolicyStatement({ actions: ['sns:Publish'], notResources: ['arn:aws:sns:*:*:*'] }));
    backoffice.evidenceBucket.grantPut(dispatcher, 'controls/scheduled-notifications/*');
    new events.Rule(this, 'ScheduledNotificationsEvery5Minutes', {
      description: 'Sends curator-approved pickup and excursion reminders that are due.',
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(dispatcher)],
    });

    new s3deploy.BucketDeployment(this, 'DeployIntranet', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      sources: [
        // A pasta não contém config.js nem a pré-visualização: as exclusões não se aplicam sem staging de assets.
        s3deploy.Source.asset(intranetAsset, { exclude: ['package.json'] }),
        s3deploy.Source.data('config.js', `window.BLU_INTRANET=${JSON.stringify({ api: api.apiEndpoint, authDomain: `https://${authHost}`, clientId: client.userPoolClientId, redirectUri: siteUrl, backofficeUrl })};`),
      ],
    });
    new s3deploy.BucketDeployment(this, 'DeployBackoffice', {
      destinationBucket: backofficeBucket,
      distribution: backofficeDistribution,
      distributionPaths: ['/*'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      sources: [
        s3deploy.Source.asset(intranetAsset, { exclude: ['package.json'] }),
        s3deploy.Source.data('config.js', `window.BLU_INTRANET=${JSON.stringify({ api: api.apiEndpoint, authDomain: `https://${authHost}`, clientId: client.userPoolClientId, redirectUri: backofficeUrl, site: 'backoffice', intranetUrl: siteUrl })};`),
      ],
    });

    new CfnOutput(this, 'IntranetUrl', { value: siteUrl });
    new CfnOutput(this, 'BackofficeUrl', { value: backofficeUrl });
    new CfnOutput(this, 'IntranetApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'IntranetUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'IntranetClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'IntranetAuthDomain', { value: loginDomain.baseUrl() });
  }
}

// Portal DMC (Next.js com SQLite): um servidor pequeno numa sub-rede privada, sem internet,
// alcançado só pelo CloudFront (VPC origin). Um portão Node valida o login Cognito da equipa
// (fundadores e curadores) antes do portal. O build corre no CodeBuild e o servidor ativa
// cada versão a partir do S3. Os dados ficam num disco próprio, com cópia diária.
const PORTAL_AMI = { 'eu-west-1': process.env.PORTAL_AMI_ID ?? 'ami-050d447ce746f6136' }; // AL2023 arm64 fixa: uma AMI nova não substitui o servidor.
// Listas geridas da AWS: com.amazonaws.global.cloudfront.origin-facing e os serviços dos gateway endpoints.
const PORTAL_PREFIX_LISTS = { 'eu-west-1': { cloudfront: 'pl-4fa04526', s3: 'pl-6da54004', dynamodb: 'pl-6fa54006' } };
const portalSeedArchive = process.env.PORTAL_SEED_ARCHIVE ?? path.resolve(infraDir, '../blu-portal-data.tar.gz');

class PortalStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tag(this);
    const { data, intranet } = props;
    const prefixLists = PORTAL_PREFIX_LISTS[region];
    if (!prefixLists || !PORTAL_AMI[region]) throw new Error(`The portal stack is only configured for ${Object.keys(PORTAL_AMI).join(', ')}`);

    // Usa a VPC isolada da stack de dados (a conta está no limite de VPCs). A VPC origin exige um
    // internet gateway ligado, mas sem rotas para ele: as sub-redes continuam sem internet. O S3 e
    // o DynamoDB chegam por gateway endpoints gratuitos.
    const vpc = data.vpc;
    const subnet = vpc.isolatedSubnets[0];
    const gateway = new ec2.CfnInternetGateway(this, 'PortalOriginGateway', { tags: [{ key: 'Name', value: 'blu-portal-vpc-origin (no routes)' }] });
    const gatewayAttachment = new ec2.CfnVPCGatewayAttachment(this, 'PortalOriginGatewayAttachment', { vpcId: vpc.vpcId, internetGatewayId: gateway.ref });
    for (const [name, service] of [['PortalS3Endpoint', ec2.GatewayVpcEndpointAwsService.S3], ['PortalDynamoDbEndpoint', ec2.GatewayVpcEndpointAwsService.DYNAMODB]]) {
      new ec2.GatewayVpcEndpoint(this, name, { vpc, service, subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }] });
    }

    const releases = new s3.Bucket(this, 'PortalReleases', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Disco de dados separado (catálogo, warehouse, versões e PDFs): sobrevive a uma troca do servidor.
    const state = new ec2.Volume(this, 'PortalState', {
      availabilityZone: subnet.availabilityZone,
      size: Size.gibibytes(10),
      volumeType: ec2.EbsDeviceVolumeType.GP3,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Tags.of(state).add('blu-backup', 'portal-state');
    const seed = existsSync(portalSeedArchive) ? new s3assets.Asset(this, 'PortalSeed', { path: portalSeedArchive }) : null;

    const serverGroup = new ec2.SecurityGroup(this, 'PortalServer', { vpc, description: 'Portal: only CloudFront on the gate port', allowAllOutbound: false });
    // Entrada só do CloudFront; saída só para o S3 e o DynamoDB (o resto não tem rota de qualquer forma).
    serverGroup.addIngressRule(ec2.Peer.prefixList(prefixLists.cloudfront), ec2.Port.tcp(8080), 'CloudFront VPC origin');
    serverGroup.addEgressRule(ec2.Peer.prefixList(prefixLists.s3), ec2.Port.tcp(443), 'S3 gateway endpoint');
    serverGroup.addEgressRule(ec2.Peer.prefixList(prefixLists.dynamodb), ec2.Port.tcp(443), 'DynamoDB gateway endpoint');
    const role = new iam.Role(this, 'PortalServerRole', { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'), description: 'Portal server: read releases, seed and leads; update lead profiles' });
    releases.grantRead(role, 'releases/*');
    releases.grantRead(role, 'config/*');
    seed?.grantRead(role);
    role.addToPolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query'], resources: [data.messages.tableArn, data.intelligence.tableArn, `${data.intelligence.tableArn}/index/FollowUpIndex`] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ['dynamodb:UpdateItem'], resources: [data.intelligence.tableArn] }));

    const userData = ec2.UserData.forLinux();
    const script = readFileSync(path.join(infraDir, 'portal/host/user-data.sh'), 'utf8').replace(/\r/g, '').replace(/^#!.*\n/, '');
    userData.addCommands(Object.entries({
      __RELEASE_BUCKET__: releases.bucketName,
      __SEED_URL__: seed ? seed.s3ObjectUrl : '',
      __VOLUME_ID__: state.volumeId,
      __REGION__: region,
      __MESSAGE_TABLE__: data.messages.tableName,
      __INTELLIGENCE_TABLE__: data.intelligence.tableName,
    }).reduce((text, [marker, value]) => text.replaceAll(marker, value), script));
    const server = new ec2.Instance(this, 'PortalServerInstance', {
      vpc,
      vpcSubnets: { subnets: [subnet] },
      instanceType: new ec2.InstanceType(process.env.PORTAL_INSTANCE_TYPE ?? 't4g.small'),
      machineImage: ec2.MachineImage.genericLinux(PORTAL_AMI),
      role,
      securityGroup: serverGroup,
      userData,
      // O arranque só corre uma vez: um script novo exige um servidor novo (o disco de dados fica).
      userDataCausesReplacement: true,
      requireImdsv2: true,
      associatePublicIpAddress: false,
      blockDevices: [{ deviceName: '/dev/xvda', volume: ec2.BlockDeviceVolume.ebs(20, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }) }],
    });
    new ec2.CfnVolumeAttachment(this, 'PortalStateAttachment', { instanceId: server.instanceId, volumeId: state.volumeId, device: '/dev/sdf' });

    // Cópia diária do disco de dados, guardada 7 dias.
    const backupRole = new iam.Role(this, 'PortalBackupRole', { assumedBy: new iam.ServicePrincipal('dlm.amazonaws.com'), managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSDataLifecycleManagerServiceRole')] });
    new dlm.CfnLifecyclePolicy(this, 'PortalStateBackup', {
      description: 'Daily snapshot of the BLU portal data disk',
      state: 'ENABLED',
      executionRoleArn: backupRole.roleArn,
      policyDetails: {
        resourceTypes: ['VOLUME'],
        targetTags: [{ key: 'blu-backup', value: 'portal-state' }],
        schedules: [{ name: 'daily', copyTags: true, createRule: { interval: 24, intervalUnit: 'HOURS', times: ['03:00'] }, retainRule: { count: 7 } }],
      },
    });

    const distribution = new cloudfront.Distribution(this, 'PortalDistribution', {
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.VpcOrigin.withEc2Instance(server, { httpPort: 8080, protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, readTimeout: Duration.seconds(60) }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // Tudo passa pelo portão: sem cache, para nenhuma página com dados de clientes ficar no CloudFront.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        compress: true,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'PortalHeaders', {
          securityHeadersBehavior: {
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN, override: true },
            strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
          },
        }),
      },
    });
    distribution.node.addDependency(gatewayAttachment);
    const portalOrigin = `https://${distribution.distributionDomainName}`;

    // Cliente Cognito próprio no mesmo grupo de utilizadores da intranet (mesma sessão e MFA).
    const client = new cognito.UserPoolClient(this, 'PortalWeb', {
      userPool: intranet.userPool,
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${portalOrigin}/auth/callback`],
        logoutUrls: [`${portalOrigin}/auth/signed-out`],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
      preventUserExistenceErrors: true,
    });
    brandLogin(this, 'PortalLoginBranding', intranet.userPool, client);

    // Configuração do portão lida pelo servidor; prune desligado para não apagar as versões.
    new s3deploy.BucketDeployment(this, 'PortalGateConfig', {
      destinationBucket: releases,
      destinationKeyPrefix: 'config',
      prune: false,
      sources: [s3deploy.Source.jsonData('gate.json', {
        region, userPoolId: intranet.userPool.userPoolId, clientId: client.userPoolClientId,
        authDomain: `https://${intranet.authHost}`, publicOrigin: portalOrigin, allowedGroups: ['founders', 'curators'],
      })],
    });

    // Build no CodeBuild (ARM, com internet): Node 24 verificado por SHA-256, npm ci, next build,
    // chaves públicas do Cognito e um pacote único com o código que o portal lê fora de dmc-workspace.
    const source = (name, relative, exclude = []) => new s3assets.Asset(this, `PortalSource${name}`, { path: path.resolve(infraDir, '..', relative), exclude });
    const sources = {
      workspace: source('Workspace', 'dmc-workspace', ['node_modules', '.next', 'tsconfig.tsbuildinfo', '.env*', 'test-results', 'playwright-report']),
      config: source('Config', 'config', ['*.local.json']),
      schemas: source('Schemas', 'src/blu_ai/schemas'),
      // Leitura do catálogo, datasets e observatório em Python (só biblioteca padrão).
      pyportal: source('PyPortal', 'portal', ['__pycache__']),
      etl: source('Etl', 'etl', ['__pycache__', 'AGENTS.md']),
      intranet: source('Intranet', 'frontend/intranet', ['config.js']),
      gate: source('Gate', 'infra/portal', ['jwks.json']),
    };
    const build = new codebuild.Project(this, 'PortalBuild', {
      description: 'Builds the BLU portal release for the private portal server',
      source: codebuild.Source.s3({ bucket: sources.workspace.bucket, path: sources.workspace.s3ObjectKey }),
      secondarySources: Object.entries(sources).filter(([name]) => name !== 'workspace').map(([name, asset]) => codebuild.Source.s3({ bucket: asset.bucket, path: asset.s3ObjectKey, identifier: name })),
      environment: { buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0, computeType: codebuild.ComputeType.LARGE },
      timeout: Duration.minutes(30),
      environmentVariables: {
        RELEASE_BUCKET: { value: releases.bucketName },
        USER_POOL_ID: { value: intranet.userPool.userPoolId },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: { shell: 'bash' },
        phases: {
          build: {
            commands: [
              'set -euo pipefail',
              'R=/tmp/release && rm -rf "$R" && mkdir -p "$R/src/blu_ai" "$R/frontend" "$R/infra"',
              'cd /tmp && curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt',
              'NODE_FILE=$(grep -m1 -oE "node-v24\\.[0-9.]+-linux-arm64\\.tar\\.xz" SHASUMS256.txt)',
              'curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$NODE_FILE" && grep " $NODE_FILE$" SHASUMS256.txt | sha256sum -c -',
              'mkdir "$R/node" && tar -xJf "$NODE_FILE" -C "$R/node" --strip-components=1 && export PATH="$R/node/bin:$PATH" && node --version',
              'cp -r "$CODEBUILD_SRC_DIR" "$R/dmc-workspace" && cp -r "$CODEBUILD_SRC_DIR_config" "$R/config"',
              'cp -r "$CODEBUILD_SRC_DIR_schemas" "$R/src/blu_ai/schemas" && cp -r "$CODEBUILD_SRC_DIR_intranet" "$R/frontend/intranet" && cp -r "$CODEBUILD_SRC_DIR_gate" "$R/infra/portal"',
              'cp -r "$CODEBUILD_SRC_DIR_pyportal" "$R/portal" && cp -r "$CODEBUILD_SRC_DIR_etl" "$R/etl"',
              'cd "$R/dmc-workspace" && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund',
              'curl -fsSL "https://cognito-idp.$AWS_REGION.amazonaws.com/$USER_POOL_ID/.well-known/jwks.json" -o "$R/infra/portal/jwks.json"',
              'node -e "process.exit(JSON.parse(require(\'fs\').readFileSync(process.argv[1])).keys.length ? 0 : 1)" "$R/infra/portal/jwks.json"',
              'ID="$(date -u +%Y%m%dT%H%M%SZ)-$CODEBUILD_BUILD_NUMBER" && tar -czf /tmp/release.tgz -C "$R" . && SHA=$(sha256sum /tmp/release.tgz | cut -d" " -f1)',
              'aws s3 cp --only-show-errors /tmp/release.tgz "s3://$RELEASE_BUCKET/releases/$ID.tar.gz"',
              'printf \'{"release":"%s","key":"releases/%s.tar.gz","sha256":"%s"}\' "$ID" "$ID" "$SHA" > /tmp/current.json',
              'aws s3 cp --only-show-errors --content-type application/json /tmp/current.json "s3://$RELEASE_BUCKET/releases/current.json"',
            ],
          },
        },
      }),
    });
    for (const asset of Object.values(sources)) asset.grantRead(build);
    releases.grantPut(build, 'releases/*');
    // Cada deploy com código novo lança um build; o servidor ativa-o sozinho quando termina.
    const sourceVersion = Object.values(sources).map(asset => asset.assetHash).join('-');
    // Só o id volta ao CloudFormation: a resposta completa do startBuild excede o limite de 4 KB.
    const startBuild = { service: 'CodeBuild', action: 'startBuild', parameters: { projectName: build.projectName, environmentVariablesOverride: [{ name: 'SOURCE_VERSION', value: sourceVersion, type: 'PLAINTEXT' }] }, outputPaths: ['build.id'], physicalResourceId: cr.PhysicalResourceId.of(`portal-build-${sourceVersion}`) };
    new cr.AwsCustomResource(this, 'PortalBuildTrigger', {
      onCreate: startBuild,
      onUpdate: startBuild,
      policy: cr.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({ actions: ['codebuild:StartBuild'], resources: [build.projectArn] })]),
      installLatestAwsSdk: false,
    });

    new CfnOutput(this, 'PortalUrl', { value: `${portalOrigin}/` });
    new CfnOutput(this, 'PortalReleaseBucket', { value: releases.bucketName });
    new CfnOutput(this, 'PortalBuildProject', { value: build.projectName });
    new CfnOutput(this, 'PortalSeedIncluded', { value: seed ? 'yes' : 'no' });
  }
}

const data = new DataStack(app, 'BluCostaData', { env, description: 'Shared low-cost conversation event data plane' });
new FrontendStack(app, 'BluCostaFrontend', { env, data, description: 'Public chatbot ingestion API; no backoffice routes' });
const backoffice = new BackofficeStack(app, 'BluCostaBackoffice', { env, data, description: 'Curator/backoffice read and analysis resources' });
const intranet = new IntranetStack(app, 'BluCostaIntranet', { env, data, backoffice, description: 'Staff intranet: Cognito login, follow-up, metrics, team, operations and governance' });
new PortalStack(app, 'BluCostaPortal', { env, data, intranet, description: 'DMC portal on a private server behind CloudFront and the team login' });
app.synth();
