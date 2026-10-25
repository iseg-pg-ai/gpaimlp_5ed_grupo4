# Infraestrutura do BLU Curation Studio

Esta stack CDK é independente da arquitetura pública descrita em
`SPLIT_ARCHITECTURE.md`. `synth:curation` apenas gera CloudFormation localmente;
`deploy:curation` cria recursos e exige autorização explícita.

## Contrato

A stack cria, por ambiente:

- uma VPC sem NAT Gateway e duas sub-redes públicas;
- um cluster ECS e uma única tarefa Fargate escritora;
- cinco containers para portal, Monitoring, apresentação, Observatório e agente;
- EFS cifrado, com backups automáticos e `RemovalPolicy.RETAIN`;
- ALB HTTPS com autenticação Cognito e uma interface por hostname;
- grupos Cognito `owner`, `admin`, `curator` e `viewer`;
- segredo de sessão no Secrets Manager;
- logs separados e permissões limitadas aos buckets e tópico SNS existentes.

O agente não tem rota pública. Os cinco containers partilham a rede da tarefa e o
volume EFS.

## Entrega executável

`Dockerfile.curation` produz a imagem única referenciada pela task ECS. A mesma
imagem contém os cinco processos, mas cada container recebe um comando distinto
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

```bash
export TARGET_AWS_ACCOUNT_ID=123456789012
export TARGET_AWS_REGION=eu-west-1
export DEPLOY_ENVIRONMENT=staging
export BLU_PUBLIC_DOMAIN=example.com
export BLU_CURATION_IMAGE_URI=123456789012.dkr.ecr.eu-west-1.amazonaws.com/blu-curation:COMMIT
export BLU_CERTIFICATE_ARN=arn:aws:acm:eu-west-1:123456789012:certificate/IDENTIFICADOR
export BLU_DATA_BUCKET_NAME=blu-dmc-data-123456789012-eu-west-1
export BLU_BACKUP_BUCKET_NAME=blu-dmc-backups-123456789012-eu-west-1
export BLU_MONITORING_SNS_TOPIC_ARN=arn:aws:sns:eu-west-1:123456789012:blu-monitoring
export BLU_AGENT_PROVIDER=bedrock
export BEDROCK_MODEL_ID=MODELO_APROVADO
export BLU_AGENT_MONTHLY_BUDGET_USD=VALOR_APROVADO
export BLU_AGENT_RATES_JSON='{"MODELO_APROVADO":{"input":PRECO_USD_MILHAO,"output":PRECO_USD_MILHAO}}'
export BLU_AGENT_TIMEOUT_SECONDS=35
npm --prefix infra run synth:curation
```

Os valores de preço não têm predefinição porque mudam por fornecedor, modelo e
região. Devem ser copiados da tabela oficial no momento da aprovação. A stack
recusa orçamento não positivo, timeout fora de 5–120 segundos e uma tabela que
não contenha o modelo selecionado. OpenAI exige ainda `OPENAI_MODEL`, segredo no
gestor de segredos e `BLU_OPENAI_ENABLED=true`; não existe fallback automático.

O domínio e certificado não são inventados pela stack. Antes de um deployment é
necessário criar os registos DNS dos quatro hostnames para o ALB emitido e confirmar
que o certificado os cobre.

## Folha de custos

A estimativa no AWS Pricing Calculator deve usar, por ambiente:

| Recurso                   | Quantidade de referência                                 |
| ------------------------- | -------------------------------------------------------- |
| Fargate Linux/ARM ou x86  | 2 vCPU, 4 GB, uma tarefa, 730 horas/mês                  |
| Application Load Balancer | 730 horas e LCUs medidas ou estimadas                    |
| EFS Standard/IA           | volume operacional real e pedidos de leitura/escrita     |
| CloudWatch Logs           | ingestão dos cinco containers e retenção de 30/365 dias  |
| Cognito                   | utilizadores ativos mensais e MFA aplicável              |
| Secrets Manager           | um segredo e chamadas de leitura por arranque            |
| Transferência             | saída para utilizadores, S3 e Bedrock conforme o tráfego |

S3, SNS e os buckets atuais são partilhados, mas os seus pedidos e armazenamento
continuam a ter custo. Não foi acrescentado NAT Gateway. A estimativa final depende
do domínio, imagem, tráfego, utilizadores e volume EFS; deve ser anexada e aprovada
antes de executar `deploy:curation`.

## Limites antes do deployment

- O Dockerfile unificado existe, mas a imagem identificada ainda não foi publicada.
- Os comandos dos containers precisam de smoke tests dentro dessa imagem.
- Falta nomear responsáveis operacionais e de segurança.
- Falta introduzir o domínio, certificado e registos DNS reais.
- Falta aprovar fornecedor, modelo, teto mensal e preços atuais do agente.
- A stack foi apenas sintetizada; não foi executado `cdk deploy`.
