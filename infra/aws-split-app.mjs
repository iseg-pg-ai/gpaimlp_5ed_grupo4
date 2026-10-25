import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  aws_apigatewayv2 as apigatewayv2,
  aws_apigatewayv2_integrations as integrations,
  aws_bedrock as bedrock,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as eventSources,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_apigatewayv2_authorizers as authorizers,
  aws_cognito as cognito,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
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
if (!/^[0-9]{12}$/.test(account ?? '')) throw new Error('TARGET_AWS_ACCOUNT_ID must be the twelve-digit destination AWS account');

const app = new App({ outdir });
const env = { account, region };
const tag = stack => {
  Tags.of(stack).add('Project', projectName);
  Tags.of(stack).add('Environment', environmentName);
  Tags.of(stack).add('ManagedBy', 'aws-cdk');
};

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
        MODEL_ID: process.env.BEDROCK_MODEL_ID ?? (region === 'eu-west-1' ? 'eu.amazon.nova-lite-v1:0' : 'amazon.nova-lite-v1:0'),
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
      sources: [s3deploy.Source.data('customer-intelligence-controls.json', JSON.stringify(governanceControls, null, 2))],
    });
    new CfnOutput(this, 'ConversationTableForBackoffice', { value: props.data.messages.tableName });
    new CfnOutput(this, 'AnalysisExportBucket', { value: exportsBucket.bucketName });
    new CfnOutput(this, 'GovernanceEvidenceBucket', { value: evidenceBucket.bucketName });
    new CfnOutput(this, 'BackofficeRagFunctionArn', { value: rag.functionArn });
    new CfnOutput(this, 'ChurnEvaluatorFunctionArn', { value: churnEvaluator.functionArn });
    new CfnOutput(this, 'BackofficeCrmQueueUrl', { value: props.data.crmEvents.queueUrl });
    new CfnOutput(this, 'WhatsAppOutboundFunctionArn', { value: whatsappOutbound.functionArn });
    this.rag = rag;
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
    for (const [group, description] of [['curators', 'Seguimento de leads e operações'], ['governance', 'Governança, evidências e aprovação de conhecimento']]) {
      new cognito.CfnUserPoolGroup(this, `Group-${group}`, { userPoolId: userPool.userPoolId, groupName: group, description });
    }
    const domainPrefix = process.env.INTRANET_AUTH_DOMAIN_PREFIX ?? `${projectName}-${environmentName}-intranet-${account.slice(-4)}`;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domainPrefix)) throw new Error('INTRANET_AUTH_DOMAIN_PREFIX must be lowercase letters, digits and hyphens');
    const loginDomain = userPool.addDomain('IntranetLogin', { cognitoDomain: { domainPrefix } });
    const authHost = `${domainPrefix}.auth.${region}.amazoncognito.com`;

    const siteBucket = new s3.Bucket(this, 'IntranetSite', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const api = new apigatewayv2.HttpApi(this, 'IntranetApi', { description: 'BLU staff intranet API (Cognito JWT)' });
    const distribution = new cloudfront.Distribution(this, 'IntranetDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'IntranetHeaders', {
          securityHeadersBehavior: {
            contentSecurityPolicy: {
              contentSecurityPolicy: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${api.apiEndpoint} https://${authHost}; form-action 'self' https://${authHost}; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
              override: true,
            },
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
            strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
          },
        }),
      },
    });
    const siteUrl = `https://${distribution.distributionDomainName}/`;
    const extraCallbacks = (process.env.INTRANET_CALLBACK_URLS ?? '').split(',').map(url => url.trim()).filter(Boolean);
    const client = userPool.addClient('IntranetWeb', {
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [siteUrl, ...extraCallbacks],
        logoutUrls: [siteUrl, ...extraCallbacks],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
      preventUserExistenceErrors: true,
    });

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
      },
      code: lambda.Code.fromAsset(path.join(infraDir, 'lambda/intranet')),
    });
    // Permissões explícitas e mínimas: sem Scan, DeleteItem nem PutItem.
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:Query', 'dynamodb:GetItem'], resources: [data.messages.tableArn, data.intelligence.tableArn, `${data.intelligence.tableArn}/index/FollowUpIndex`] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:UpdateItem'], resources: [data.intelligence.tableArn] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['sqs:GetQueueAttributes'], resources: [data.events.queueArn, data.crmEvents.queueArn, `arn:aws:sqs:${region}:${account}:BluCostaData-ConversationEventsDlq*`] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['lambda:ListFunctions', 'cloudwatch:GetMetricData'], resources: ['*'] }));
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['cognito-idp:ListUsersInGroup'], resources: [userPool.userPoolArn] }));
    backoffice.evidenceBucket.grantRead(fn, 'controls/*');
    backoffice.rag.grantInvoke(fn);

    const authorizer = new authorizers.HttpJwtAuthorizer('IntranetJwt', `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}`, { jwtAudience: [client.userPoolClientId] });
    const integration = new integrations.HttpLambdaIntegration('IntranetIntegration', fn);
    const routes = [
      ['GET', '/v1/me'], ['GET', '/v1/leads'], ['GET', '/v1/leads/{id}'],
      ['POST', '/v1/leads/{id}/contacted'], ['POST', '/v1/leads/{id}/assign'], ['PUT', '/v1/leads/{id}/tags'], ['POST', '/v1/leads/{id}/ask'],
      ['GET', '/v1/metrics'], ['GET', '/v1/team'], ['GET', '/v1/operations'], ['GET', '/v1/governance'],
    ];
    for (const [method, routePath] of routes) {
      api.addRoutes({ path: routePath, methods: [apigatewayv2.HttpMethod[method]], integration, authorizer });
    }
    // CORS só do domínio da intranet; limite de pedidos para conter abusos com um token roubado.
    const cfnApi = api.node.defaultChild;
    cfnApi.corsConfiguration = { allowOrigins: [`https://${distribution.distributionDomainName}`], allowHeaders: ['authorization', 'content-type'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], maxAge: 600 };
    api.defaultStage.node.defaultChild.defaultRouteSettings = { throttlingBurstLimit: 40, throttlingRateLimit: 20 };

    new s3deploy.BucketDeployment(this, 'DeployIntranet', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      sources: [
        s3deploy.Source.asset(intranetAsset, { exclude: ['config.js', 'dev', 'package.json', '*.test.js'] }),
        s3deploy.Source.data('config.js', `window.BLU_INTRANET=${JSON.stringify({ api: api.apiEndpoint, authDomain: `https://${authHost}`, clientId: client.userPoolClientId, redirectUri: siteUrl })};`),
      ],
    });

    new CfnOutput(this, 'IntranetUrl', { value: siteUrl });
    new CfnOutput(this, 'IntranetApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'IntranetUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'IntranetClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'IntranetAuthDomain', { value: loginDomain.baseUrl() });
  }
}

const data = new DataStack(app, 'BluCostaData', { env, description: 'Shared low-cost conversation event data plane' });
new FrontendStack(app, 'BluCostaFrontend', { env, data, description: 'Public chatbot ingestion API; no backoffice routes' });
const backoffice = new BackofficeStack(app, 'BluCostaBackoffice', { env, data, description: 'Curator/backoffice read and analysis resources' });
new IntranetStack(app, 'BluCostaIntranet', { env, data, backoffice, description: 'Staff intranet: Cognito login, follow-up, metrics, team, operations and governance' });
app.synth();
