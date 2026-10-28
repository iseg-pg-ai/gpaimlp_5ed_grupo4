# Infraestrutura do BLU Curation Studio

Esta stack CDK é independente da arquitetura pública descrita em
`SPLIT_ARCHITECTURE.md`. `synth:curation` apenas gera CloudFormation localmente;
`deploy:curation` cria recursos e exige autorização explícita.

## Estado e âmbito

O destino escolhido para o portal é o Code Editor. Esta stack permanece como
alternativa de hosting cloud; não é executada pelo onboarding nem por `blu up`.
Síntese, publicação ECR, assinatura e deployment têm validações distintas.

## Contrato

A stack cria, por ambiente:

- uma VPC sem NAT Gateway e duas sub-redes públicas;
- um cluster ECS e uma única tarefa Fargate escritora;
- quatro containers para portal, Monitoring, apresentação e Observatório;
- EFS cifrado, com backups automáticos e `RemovalPolicy.RETAIN`;
- ALB HTTPS com autenticação Cognito e uma interface por hostname;
- grupos Cognito `owner`, `admin`, `curator` e `viewer`;
- segredo de sessão no Secrets Manager;
- logs separados e permissões limitadas aos buckets e tópico SNS existentes.

O agente é invocado pelo portal através do planeador Python integrado e não tem
container nem rota pública. Os quatro containers partilham a rede da tarefa e o
volume EFS.

## Entrega executável

`Dockerfile.curation` produz a imagem única referenciada pela task ECS. A mesma
imagem contém os quatro processos, mas cada container recebe um comando distinto
na task definition. O build fixa Python, Node e `uv`, usa os locks do projeto e
não inclui `data/`, `warehouse/`, `exports/`, backups, runtimes ou segredos.

O workflow `Portal` constrói a imagem em cada alteração relevante e nunca a
publica. A publicação num ECR privado, assinatura, SBOM e promoção por digest
continuam a pertencer ao pipeline de deployment, depois da aprovação de custos e
ambiente. Os modelos Argos e fontes CJK não são descarregados implicitamente no
build; devem ser entregas identificadas ou volumes aprovados antes de produção.

No SageMaker Studio atual, o daemon Docker recusa builds iniciados pelo utilizador
do Code Editor com `Forbidden [ImageBuild] 'sagemaker' is the only user allowed
network input`. Não contornar essa política nem elevar privilégios. A validação
integral da imagem pertence ao job Buildx do GitHub Actions; localmente validam-se
o portal, os testes e o contrato da stack.

## Parâmetros obrigatórios

Definir os valores aprovados no ambiente de síntese; os nomes abaixo são
parâmetros, não valores a copiar literalmente. Não carregar um `.env` como
código shell.

| Variável | Contrato |
| --- | --- |
| `TARGET_AWS_ACCOUNT_ID` | Conta de destino com 12 dígitos |
| `TARGET_AWS_REGION` | Região da conta, por omissão `eu-west-1` |
| `DEPLOY_ENVIRONMENT` | `staging` ou `production` |
| `BLU_PUBLIC_DOMAIN` | Domínio aprovado, sem esquema ou caminho |
| `BLU_CURATION_IMAGE_URI` | URI ECR da conta/região, fixada por SHA-256 |
| `BLU_CERTIFICATE_ARN` | Certificado ACM que cobre os hostnames |
| `BLU_DATA_BUCKET_NAME` | Bucket de releases existente |
| `BLU_BACKUP_BUCKET_NAME` | Bucket de checkpoints existente |
| `BLU_MONITORING_SNS_TOPIC_ARN` | Tópico privado aprovado |
| `BLU_AGENT_PROVIDER` | `bedrock` |
| `BEDROCK_MODEL_ID` | Modelo ou perfil aprovado |
| `BLU_AGENT_MONTHLY_BUDGET_USD` | Teto positivo aprovado |
| `BLU_AGENT_RATES_JSON` | JSON com o modelo e preços numéricos `input`/`output` por milhão de tokens |
| `BLU_AGENT_TIMEOUT_SECONDS` | Entre 5 e 120 segundos, predefinido 35 |

Depois de preparar as variáveis, a síntese local é:

```bash
npm --prefix infra run synth:curation
```

A imagem tem de usar o digest SHA-256 aprovado, com 64 caracteres hexadecimais,
na conta e região alvo. Tags, incluindo tags de commit, são recusadas. O output
`ImageUri` regista a referência exata usada nos quatro containers. A publicação
no ECR e a verificação de assinatura continuam a ser passos distintos, sujeitos ao procedimento de entrega; conhecer um digest não comprova aprovação
ou assinatura.

Os valores de preço não têm predefinição porque mudam por fornecedor, modelo e
região. Devem ser copiados da tabela oficial no momento da aprovação. A stack
recusa orçamento não positivo, timeout fora de 5–120 segundos e uma tabela que
não contenha o modelo Bedrock selecionado. Não existe fallback automático.

O domínio e certificado não são inventados pela stack. Antes de um deployment é
necessário criar os registos DNS dos quatro hostnames para o ALB emitido e confirmar
que o certificado os cobre.

## Folha de custos

A estimativa no AWS Pricing Calculator deve usar, por ambiente:

| Recurso | Dimensão a estimar |
| --- | --- |
| Fargate Linux/x86 | 2 vCPU, 4 GB, uma tarefa e horas efetivas |
| Application Load Balancer | Horas e LCUs medidas ou estimadas |
| EFS Standard/IA | Volume operacional e pedidos de leitura/escrita |
| CloudWatch Logs | Ingestão dos quatro containers e retenção 30/365 dias |
| Cognito | Utilizadores ativos e MFA aplicável |
| Secrets Manager | Um segredo e chamadas por arranque |
| Transferência | Saída para utilizadores, S3 e Bedrock |

S3, SNS e os buckets atuais são partilhados, mas os seus pedidos e armazenamento
continuam a ter custo. Não foi acrescentado NAT Gateway. A estimativa final depende
do domínio, imagem, tráfego, utilizadores e volume EFS; deve ser anexada e aprovada
antes de executar `deploy:curation`.

## Ligação opcional a Leads

Configurar em conjunto `BLU_CONVERSATION_TABLE` e `BLU_INTELLIGENCE_TABLE` com
os nomes das tabelas Data do mesmo ambiente. Configuração parcial ou nomes
inválidos impedem a síntese. Apenas o portal recebe os nomes; a role partilhada
da task recebe Query nas duas tabelas e no FollowUpIndex e UpdateItem apenas
na tabela de inteligência. Não são criadas tabelas nem isolamento IAM por
container. Sem a configuração, a curadoria isolada continua possível e Leads
fica indisponível.

## Limites antes do deployment

- Validar a imagem e o smoke do digest exato pelo [pipeline de entrega](IMAGE_DELIVERY.md).
- Confirmar domínio, certificado, DNS, identidade e isolamento dos dados.
- Aprovar custos, responsáveis, objetivos de recuperação e rollback.
- Preparar modelos de tradução e fontes CJK identificados.
- Validar a configuração atual do agente e a evidência do ambiente-alvo.
- Executar `cdk diff` antes de qualquer deployment autorizado.

Testes de síntese não comprovam recursos publicados. A fundamentação pertence a
[Decisões](../docs/DECISIONS.md); o resultado de uma execução antiga não descreve
automaticamente o estado atual da conta AWS.
