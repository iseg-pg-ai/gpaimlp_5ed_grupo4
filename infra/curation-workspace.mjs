// Define a alternativa de hosting do portal em infraestrutura cloud; não é requisito do
// arranque no Code Editor.
import { readFileSync } from "node:fs";
import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  aws_certificatemanager as acm,
  aws_cognito as cognito,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_efs as efs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_elasticloadbalancingv2_actions as actions,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sns as sns,
} from "aws-cdk-lib";
import { Construct } from "constructs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const account = required("TARGET_AWS_ACCOUNT_ID");
const region = process.env.TARGET_AWS_REGION?.trim() || "eu-west-1";
const environment = process.env.DEPLOY_ENVIRONMENT?.trim() || "staging";
const domain = required("BLU_PUBLIC_DOMAIN").toLowerCase();
const imageUri = required("BLU_CURATION_IMAGE_URI");
const certificateArn = required("BLU_CERTIFICATE_ARN");
const dataBucketName = required("BLU_DATA_BUCKET_NAME");
const backupBucketName = required("BLU_BACKUP_BUCKET_NAME");
const notificationTopicArn = required("BLU_MONITORING_SNS_TOPIC_ARN");
const agentProvider =
  process.env.BLU_AGENT_PROVIDER?.trim().toLowerCase() || "bedrock";
const agentModel = required("BEDROCK_MODEL_ID");
const agentBudget = required("BLU_AGENT_MONTHLY_BUDGET_USD");
const agentRates = required("BLU_AGENT_RATES_JSON");
const agentTimeout = process.env.BLU_AGENT_TIMEOUT_SECONDS?.trim() || "35";
const conversationTable = process.env.BLU_CONVERSATION_TABLE?.trim() || "";
const intelligenceTable = process.env.BLU_INTELLIGENCE_TABLE?.trim() || "";
if (Boolean(conversationTable) !== Boolean(intelligenceTable))
  throw new Error(
    "BLU_CONVERSATION_TABLE and BLU_INTELLIGENCE_TABLE must be configured together",
  );
for (const table of [conversationTable, intelligenceTable].filter(Boolean))
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(table))
    throw new Error(
      "BLU_CONVERSATION_TABLE and BLU_INTELLIGENCE_TABLE must be valid table names",
    );

if (!/^\d{12}$/.test(account))
  throw new Error("TARGET_AWS_ACCOUNT_ID must contain 12 digits");
if (!/^(staging|production)$/.test(environment))
  throw new Error("DEPLOY_ENVIRONMENT must be staging or production");
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
  throw new Error("BLU_PUBLIC_DOMAIN is invalid");
if (agentProvider !== "bedrock")
  throw new Error("BLU_AGENT_PROVIDER must be bedrock");
if (!Number.isFinite(Number(agentBudget)) || Number(agentBudget) <= 0)
  throw new Error("BLU_AGENT_MONTHLY_BUDGET_USD must be positive");
if (
  !Number.isFinite(Number(agentTimeout)) ||
  Number(agentTimeout) < 5 ||
  Number(agentTimeout) > 120
)
  throw new Error("BLU_AGENT_TIMEOUT_SECONDS must be between 5 and 120");
let parsedAgentRates;
try {
  parsedAgentRates = JSON.parse(agentRates);
} catch {
  throw new Error("BLU_AGENT_RATES_JSON must be valid JSON");
}
const selectedRate = parsedAgentRates?.[agentModel];
if (
  !selectedRate ||
  !Number.isFinite(selectedRate.input) ||
  selectedRate.input < 0 ||
  !Number.isFinite(selectedRate.output) ||
  selectedRate.output < 0
)
  throw new Error(
    "BLU_AGENT_RATES_JSON must include non-negative rates for the selected model",
  );
if (!/^arn:aws(-[^:]+)?:acm:[^:]+:\d{12}:certificate\/.+/.test(certificateArn))
  throw new Error("BLU_CERTIFICATE_ARN is invalid");
const imageMatch = imageUri.match(
  new RegExp(
    `^${account}\\.dkr\\.ecr\\.${region}\\.amazonaws\\.com/([a-z0-9._/-]+)@(sha256:[a-f0-9]{64})$`,
  ),
);
if (!imageMatch)
  throw new Error(
    "BLU_CURATION_IMAGE_URI must be an ECR image pinned by sha256 digest in the target account and region",
  );

const hosts = {
  portal: `portal.${environment}.${domain}`,
  monitoring: `monitoring.${environment}.${domain}`,
  presentation: `presentation.${environment}.${domain}`,
  observatory: `analytics.${environment}.${domain}`,
};

const app = new App();

class CurationWorkspaceStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    Tags.of(this).add("Project", "blu-curation");
    Tags.of(this).add("Environment", environment);
    Tags.of(this).add("ManagedBy", "aws-cdk");

    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr(
        process.env.BLU_CURATION_VPC_CIDR ||
          (environment === "production" ? "10.42.0.0/16" : "10.43.0.0/16"),
      ),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public-service",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    const fileSystem = new efs.FileSystem(this, "OperationalFileSystem", {
      vpc,
      encrypted: true,
      enableAutomaticBackups: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const accessPoint = fileSystem.addAccessPoint("ApplicationAccessPoint", {
      path: "/blu",
      createAcl: { ownerGid: "1000", ownerUid: "1000", permissions: "750" },
      posixUser: { gid: "1000", uid: "1000" },
    });

    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa:
        environment === "production"
          ? cognito.Mfa.REQUIRED
          : cognito.Mfa.OPTIONAL,
      passwordPolicy: {
        minLength: 14,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    for (const [groupName, precedence] of [
      ["owner", 0],
      ["admin", 10],
      ["curator", 20],
      ["viewer", 30],
    ])
      new cognito.CfnUserPoolGroup(this, `Group${groupName}`, {
        userPoolId: userPool.userPoolId,
        groupName,
        precedence,
      });
    const userPoolDomain = userPool.addDomain("HostedLogin", {
      cognitoDomain: { domainPrefix: `blu-curation-${environment}-${account}` },
    });
    const client = userPool.addClient("WebClient", {
      generateSecret: true,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: Object.values(hosts).map(
          (host) => `https://${host}/oauth2/idpresponse`,
        ),
        logoutUrls: Object.values(hosts).map((host) => `https://${host}/`),
      },
      preventUserExistenceErrors: true,
    });

    const dataBucket = s3.Bucket.fromBucketName(
      this,
      "DataBucket",
      dataBucketName,
    );
    const backupBucket = s3.Bucket.fromBucketName(
      this,
      "BackupBucket",
      backupBucketName,
    );
    const notifications = sns.Topic.fromTopicArn(
      this,
      "Notifications",
      notificationTopicArn,
    );
    const sessionSecret = new secretsmanager.Secret(this, "SessionSecret", {
      description: `BLU ${environment} server-side session secret`,
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    const task = new ecs.FargateTaskDefinition(this, "Task", {
      cpu: 2048,
      memoryLimitMiB: 4096,
      volumes: [
        {
          name: "operational",
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: "ENABLED",
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
              iam: "ENABLED",
            },
          },
        },
      ],
    });
    dataBucket.grantReadWrite(task.taskRole, `${environment}/*`);
    backupBucket.grantReadWrite(task.taskRole, `blu-backups/${environment}/*`);
    // Reutilizar as tabelas da stack Data; não criar persistência paralela de Leads.
    if (conversationTable) {
      const tableArn = (name) =>
        this.formatArn({
          service: "dynamodb",
          resource: "table",
          resourceName: name,
        });
      task.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: ["dynamodb:Query"],
          resources: [
            tableArn(conversationTable),
            tableArn(intelligenceTable),
            `${tableArn(intelligenceTable)}/index/FollowUpIndex`,
          ],
        }),
      );
      task.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: ["dynamodb:UpdateItem"],
          resources: [tableArn(intelligenceTable)],
        }),
      );
    }
    notifications.grantPublish(task.taskRole);
    sessionSecret.grantRead(task.taskRole);
    task.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      }),
    );

    const commonEnvironment = {
      BLU_ENVIRONMENT: environment,
      BLU_DATA_S3_BUCKET: dataBucketName,
      BLU_BACKUP_S3_BUCKET: backupBucketName,
      BLU_BACKUP_S3_PREFIX: "blu-backups",
      BLU_MONITORING_NOTIFICATIONS_ENABLED: "true",
      BLU_MONITORING_SNS_TOPIC_ARN: notificationTopicArn,
      BLU_AGENT_PROVIDER: agentProvider,
      BEDROCK_MODEL_ID: agentModel,
      BLU_AGENT_MONTHLY_BUDGET_USD: agentBudget,
      BLU_AGENT_RATES_JSON: agentRates,
      BLU_AGENT_TIMEOUT_SECONDS: agentTimeout,
      BLU_RUNTIME_ROOT: "/var/lib/blu/runtime",
      BLU_DATA_DIR: "/var/lib/blu/runtime/data",
      BLU_WAREHOUSE_DIR: "/var/lib/blu/runtime/warehouse",
      BLU_EXPORT_DIR: "/var/lib/blu/exports/itineraries",
      BLU_OPERATIONAL_DIR: "/var/lib/blu/operational",
      BLU_MONITORING_RUNTIME: "/var/lib/blu/monitoring",
      BLU_BIND_HOST: "0.0.0.0",
      BLU_IDENTITY_MODE: "alb-cognito",
      BLU_COGNITO_USER_POOL_ID: userPool.userPoolId,
      BLU_COGNITO_CLIENT_ID: client.userPoolClientId,
      BLU_COGNITO_ISSUER: `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}`,
    };
    const repository = ecr.Repository.fromRepositoryName(
      this,
      "ApplicationRepository",
      imageMatch[1],
    );
    const image = ecs.ContainerImage.fromEcrRepository(
      repository,
      imageMatch[2],
    );
    const definitions = JSON.parse(
      readFileSync(
        new URL("../config/curation_services.json", import.meta.url),
        "utf8",
      ),
    );
    if (
      definitions.schema_version !== 1 ||
      !Array.isArray(definitions.services)
    )
      throw new Error("Invalid curation services configuration");
    const containers = definitions.services.map(({ name, port, command }) => {
      const logGroup = new logs.LogGroup(this, `${name}Logs`, {
        retention:
          environment === "production"
            ? logs.RetentionDays.ONE_YEAR
            : logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const container = task.addContainer(name, {
        image,
        command,
        environment: {
          ...commonEnvironment,
          ...(name === "portal"
            ? {
                BLU_PUBLIC_URL: `https://${hosts.portal}`,
                ...(conversationTable
                  ? {
                      BLU_CONVERSATION_TABLE: conversationTable,
                      BLU_INTELLIGENCE_TABLE: intelligenceTable,
                    }
                  : {}),
              }
            : {}),
          ...(name === "monitoring"
            ? { BLU_MONITORING_PUBLIC_URL: `https://${hosts.monitoring}` }
            : {}),
          ...(name === "presentation"
            ? {
                BLU_PRESENTATION_BASE_PATH: "",
                BLU_PORTAL_PUBLIC_URL: `https://${hosts.portal}`,
              }
            : {}),
          ...(name === "observatory"
            ? { BLU_DASHBOARD_PUBLIC_URL: `https://${hosts.observatory}` }
            : {}),
        },
        secrets: {
          BLU_SESSION_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
        },
        logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: name }),
        essential: name === "portal",
      });
      container.addPortMappings({
        containerPort: port,
        protocol: ecs.Protocol.TCP,
      });
      container.addMountPoints({
        sourceVolume: "operational",
        containerPath: "/var/lib/blu",
        readOnly: false,
      });
      return { name, port, container };
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      "ServiceSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      },
    );
    const loadBalancerSecurityGroup = new ec2.SecurityGroup(
      this,
      "LoadBalancerSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      },
    );
    loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "HTTPS",
    );
    serviceSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcpRange(3001, 8501),
    );
    fileSystem.connections.allowDefaultPortFrom(serviceSecurityGroup);

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: task,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [serviceSecurityGroup],
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "LoadBalancer",
      {
        vpc,
        internetFacing: true,
        securityGroup: loadBalancerSecurityGroup,
      },
    );
    containers
      .find(({ name }) => name === "portal")
      .container.addEnvironment("BLU_ALB_ARN", loadBalancer.loadBalancerArn);
    const listener = loadBalancer.addListener("Https", {
      port: 443,
      certificates: [
        acm.Certificate.fromCertificateArn(this, "Certificate", certificateArn),
      ],
      defaultAction: elbv2.ListenerAction.fixedResponse(404),
    });
    const healthPaths = {
      portal: "/",
      monitoring: "/health",
      presentation: "/",
      observatory: "/_stcore/health",
    };
    containers
      .filter(({ name }) => name !== "agent")
      .forEach(({ name, port, container }, index) => {
        const target = new elbv2.ApplicationTargetGroup(this, `${name}Target`, {
          vpc,
          port,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targetType: elbv2.TargetType.IP,
          healthCheck: { path: healthPaths[name], healthyHttpCodes: "200-399" },
          deregistrationDelay: Duration.seconds(30),
        });
        service.attachToApplicationTargetGroup(target, container, port);
        listener.addAction(`${name}Route`, {
          priority: 10 + index,
          conditions: [elbv2.ListenerCondition.hostHeaders([hosts[name]])],
          action: new actions.AuthenticateCognitoAction({
            userPool,
            userPoolClient: client,
            userPoolDomain,
            next: elbv2.ListenerAction.forward([target]),
          }),
        });
      });

    new CfnOutput(this, "LoadBalancerDnsName", {
      value: loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "ImageUri", { value: imageUri });
    new CfnOutput(this, "PortalHost", { value: hosts.portal });
    new CfnOutput(this, "MonitoringHost", { value: hosts.monitoring });
    new CfnOutput(this, "PresentationHost", { value: hosts.presentation });
    new CfnOutput(this, "ObservatoryHost", { value: hosts.observatory });
  }
}

new CurationWorkspaceStack(app, `BluCuration-${environment}`, {
  env: { account, region },
  terminationProtection: environment === "production",
});
