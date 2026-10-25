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
volume EFS. A imagem indicada tem de incluir Node, Python, dependências bloqueadas,
build do portal e todos os pontos de entrada; essa entrega será criada na Etapa 3.

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
npm --prefix infra run synth:curation
```

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

- A imagem unificada ainda não existe.
- Os comandos dos containers precisam de smoke tests dentro dessa imagem.
- Falta nomear responsáveis operacionais e de segurança.
- Falta introduzir o domínio, certificado e registos DNS reais.
- A stack foi apenas sintetizada; não foi executado `cdk deploy`.
