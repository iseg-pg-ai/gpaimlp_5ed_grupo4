# Validação num segundo SageMaker Code Editor

Este registo acompanha o ensaio de onboarding realizado num Code Editor novo e
independente. Complementa o [guia de onboarding](ONBOARDING.md) e só deve ser
marcado como concluído depois de existirem evidências de todas as etapas.

## Ambiente do ensaio

- Branch: `feat/last-verification`
- Região: `eu-west-1`
- URL base do segundo Code Editor: guardada apenas em
  `config/studio.local.json`, fora do Git.
- Estado: em execução

Não copiar `.aws/`, `.env`, caches, contas do Monitoring, catálogo ou exports do
primeiro workspace.

## Etapa 1 — Clone, ferramentas e identidade AWS

No terminal do segundo Code Editor:

```bash
git clone --branch feat/last-verification \
  https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4.git blu-validation

cd blu-validation

python3 --version
node --version
npm --version
git --version
aws sts get-caller-identity
```

Confirmar antes de avançar:

- o clone termina sem erros e fica no branch indicado;
- Python é 3.12 ou 3.13;
- Node é pelo menos 22.13 e inferior a 25;
- npm e Git estão disponíveis;
- `aws sts get-caller-identity` devolve a conta, ARN e identidade IAM efetivos.

Não executar ainda `just blu it`. Os passos seguintes serão acrescentados depois
de validar a saída desta etapa.

### Resultado da etapa 1

- Clone independente concluído.
- Python 3.12.15 e Git 2.43.0: conformes.
- Node 20.19.6: incompatível; é necessário instalar Node 24 LTS.
- npm 11.21.0: disponível, mas será revalidado com o Node selecionado.
- A chamada STS funcionou, mas devolveu a mesma
  `SageMakerTeachingExecutionRole` do primeiro workspace. O isolamento do espaço
  está comprovado; a validação com identidade IAM distinta continua pendente.

## Etapa 2 — Selecionar Node 24 LTS

O workspace não incluía `nvm`. Descarregar primeiro o instalador oficial numa
versão fixa, executá-lo separadamente e instalar/selecionar Node 24:

```bash
curl -fsSLo /tmp/nvm-install.sh \
  https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh
bash /tmp/nvm-install.sh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 24
nvm alias default 24
nvm use 24
command -v node
command -v npm
node --version
npm --version
```

O resultado esperado é Node 24.x. A instalação é local ao utilizador deste
workspace e não altera o repositório.

### Resultado da etapa 2

- NVM 0.40.8 instalado na pasta pessoal.
- Node 24.22.1 e npm 11.19.1 selecionados a partir da mesma instalação.
- Download do Node validado pelo instalador através de SHA-256.

## Etapa 3 — Preparar as dependências Python

Instalar a versão de `uv` fixada pelo projeto e sincronizar todos os grupos do
lockfile:

```bash
python3 -m pip install --user uv==0.12.19
export PATH="$HOME/.local/bin:$PATH"
uv --version
uv sync --locked --all-groups
```

Não usar `requirements.txt` nem instalar pacotes Python individualmente. O comando
de sincronização deve terminar sem alterar `uv.lock`.

### Resultado da etapa 3

- `uv 0.12.19` já estava disponível na pasta pessoal.
- O lock resolveu 149 pacotes e verificou 147 pacotes sem erros.

## Etapa 4 — Configurar o workspace sem materializar dados

Confirmar primeiro que o clone continua limpo e executar o assistente com a URL
própria deste Code Editor:

```bash
git status --short

.venv/bin/python scripts/setup_workspace.py \
  --studio-url \
  "https://<studio-id>.studio.eu-west-1.sagemaker.aws/codeeditor/default"

.venv/bin/python scripts/setup_workspace.py --check-only
```

O assistente pode criar uma palavra-passe inicial em
`monitoring/runtime/initial-password.txt`. Essa palavra-passe é local e não deve
ser copiada para documentação, Git ou mensagens. Nesta etapa não se usa
`--initialize-data`: os dados serão materializados do S3.

### Resultado da etapa 4

- O clone permaneceu limpo antes da configuração.
- O diagnóstico confirmou Python 3.12.15, Node 24.22.1, npm 11.19.1,
  `uv 0.12.19`, Git 2.43.0 e a URL própria deste workspace.
- A configuração local e o acesso inicial do Monitoring foram criados.
- Não existia cache de dados; o diagnóstico confirmou que será materializada
  pelo fluxo S3 do `just blu it`.

## Etapa 5 — Validar o acesso IAM aos buckets

Antes de executar a recuperação, confirmar os nomes efetivos dos buckets de dados
e backups. Estes identificadores não são segredos, mas não devem ser inferidos nem
substituídos por nomes de exemplo. Os comandos de leitura e a configuração local
usam variáveis temporárias para evitar guardar identificadores do ambiente no Git:

```bash
export DATA_BUCKET="<bucket-de-dados>"
export BACKUP_BUCKET="<bucket-de-backups>"

for prefix in \
  development/sources/ \
  development/warehouse/ \
  development/operational/
do
  aws s3api list-objects-v2 \
    --bucket "$DATA_BUCKET" \
    --prefix "$prefix" \
    --max-keys 1 \
    --query '{count:KeyCount,key:Contents[0].Key}'
done

aws s3api list-objects-v2 \
  --bucket "$BACKUP_BUCKET" \
  --prefix blu-backups/development/checkpoint/ \
  --max-keys 1 \
  --query '{count:KeyCount,key:Contents[0].Key}'
```

Uma resposta com `count` igual a zero continua a provar autorização de listagem;
`AccessDenied` indica que a política IAM ou o prefixo ainda não está correto.

### Resultado da etapa 5

A mesma role do primeiro workspace conseguiu listar, no segundo workspace, pelo
menos um objeto em cada prefixo esperado:

- fontes;
- warehouse;
- estado operacional;
- checkpoints de backup.

Os nomes dos buckets e objetos não ficam registados neste documento. A listagem
prova leitura autorizada, mas ainda não comprova escrita, integridade do conteúdo
ou recuperação.

## Etapa 6 — Guardar configuração local e inventariar releases

Criar o `.env` ignorado pelo Git a partir do exemplo, preencher apenas a
configuração operacional e confirmar que o ficheiro não será versionado:

```bash
cp .env.example .env

sed -i \
  -e "s|^# BLU_DATA_S3_BUCKET=.*|BLU_DATA_S3_BUCKET=${DATA_BUCKET}|" \
  -e "s|^# BLU_BACKUP_S3_BUCKET=.*|BLU_BACKUP_S3_BUCKET=${BACKUP_BUCKET}|" \
  -e "s|^# BLU_BACKUP_S3_PREFIX=.*|BLU_BACKUP_S3_PREFIX=blu-backups|" \
  -e "s|^# BLU_ENVIRONMENT=.*|BLU_ENVIRONMENT=development|" \
  .env

chmod 600 .env
git check-ignore -v .env

export BLU_DATA_S3_BUCKET="$DATA_BUCKET"
export BLU_BACKUP_S3_BUCKET="$BACKUP_BUCKET"
export BLU_BACKUP_S3_PREFIX=blu-backups
export BLU_ENVIRONMENT=development

.venv/bin/python -B -m etl.s3_transport inventory sources
.venv/bin/python -B -m etl.s3_transport inventory warehouse
```

O inventário é estritamente de leitura. Deve encontrar uma release válida ativa;
qualquer release `invalid` deve ser investigada antes da recuperação.

### Resultado da etapa 6

- `.env` criado com permissões locais e confirmado pelo `.gitignore`.
- Fontes: uma release válida ativa, sem releases inválidas.
- Warehouse: uma release válida ativa e seis válidas substituídas, sem releases
  inválidas.
- Não foram ainda efetuadas escritas nos buckets a partir deste workspace.

## Etapa 7 — Validar o perfil Bedrock

Consultar primeiro os metadados do perfil configurado, sem gerar conteúdo:

```bash
aws bedrock get-inference-profile \
  --region eu-west-1 \
  --inference-profile-identifier eu.amazon.nova-pro-v1:0 \
  --query '{status:status,id:inferenceProfileId,models:models[*].modelArn}'
```

Esta chamada valida acesso ao plano de controlo. Uma inferência real é um teste
separado, com custo, e só será executada após autorização explícita.

### Resultado do controlo Bedrock

- Perfil `eu.amazon.nova-pro-v1:0` encontrado com estado `ACTIVE`.
- O perfil encaminha inferência para modelos Amazon Nova Pro autorizados em
  regiões europeias.
- A permissão de execução `bedrock-runtime:Converse` ainda não foi comprovada.

### Teste de inferência sujeito a autorização

Depois de autorizar o custo reduzido de uma única chamada, executar:

```bash
aws bedrock-runtime converse \
  --region eu-west-1 \
  --model-id eu.amazon.nova-pro-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Responde apenas: BLU_OK"}]}]' \
  --inference-config '{"maxTokens":8,"temperature":0}' \
  --query 'output.message.content[0].text' \
  --output text
```

O resultado esperado é `BLU_OK`. Não são enviados dados de clientes ou do portal.

### Resultado da inferência Bedrock

- A chamada real a `bedrock-runtime:Converse` foi autorizada e devolveu conteúdo.
- O modelo acrescentou texto ao marcador solicitado. Este ensaio comprova
  conectividade e autorização, não conformidade semântica do agente.
- A avaliação comportamental do agente permanece fora deste ensaio, conforme a
  decisão de saltar essa prioridade.

## Etapa 8 — Recuperação integral

O passo seguinte é `./bin/just blu it`. Esta operação tem efeitos reais: cria e
valida um checkpoint quando existir estado, pode escrever no bucket de backups,
materializa as releases autorizadas, pode republicar o estado operacional
recuperado, instala dependências de navegador, testa, constrói e inicia serviços.
Deve ser executada apenas após autorização explícita para estas escritas S3.

### Execução autorizada

A recuperação integral e as escritas S3 associadas foram autorizadas. No segundo
workspace, carregar as ferramentas locais, consultar as credenciais apenas no
terminal e iniciar o protocolo:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
export PATH="$HOME/.local/bin:$PATH"

cat monitoring/runtime/initial-password.txt
./bin/just blu it
```

Não copiar a saída do ficheiro de credenciais para mensagens ou documentação. O
comando pedirá utilizador e palavra-passe; a palavra-passe não deve ser incluída
na linha de comandos. Conservar a saída final das tarefas, omitindo segredos.

Confirmar no final:

- checkpoint S3 criado ou ausência de estado novo tratada de forma explícita;
- cache reconstruída a partir das releases autorizadas;
- testes e builds concluídos;
- cinco endpoints online;
- quatro interfaces abertas através da URL deste workspace;
- nenhum dado persistente criado dentro do repositório.

### Primeiro resultado

As etapas de autenticação, checkpoint, paragem, ambiente, dependências, recuperação
e ETL, portal, Monitoring, dados, testes, builds, arranque e endpoints chegaram a
100%. Os testes do Monitoring passaram nas larguras 320, 768, 1440 e 2560.

O protocolo parou aos 90% da última tarefa porque
`presentation/test-browser.mjs` ainda comparava o link final com o domínio privado
do primeiro workspace. A apresentação tinha gerado corretamente o URL do segundo
workspace; a falha estava apenas na expectativa fixa do teste.

A correção passou a calcular o URL esperado a partir de
`config/studio.local.json` e acrescentou uma regressão que rejeita domínios
SageMaker fixos. A validação local passou nas quatro larguras. O segundo workspace
deve atualizar o branch e repetir o protocolo depois de a correção ser publicada.

## Evidência

- [x] Clone independente concluído.
- [x] Versões de Python, Node, npm e Git conformes.
- [x] Identidade IAM efetiva confirmada.
- [ ] Ensaio repetido com identidade IAM distinta.
- [x] Dependências instaladas pelo lockfile.
- [x] Configuração local criada com a URL deste workspace.
- [x] Leitura IAM do bucket de dados validada.
- [x] Leitura IAM do bucket de backups validada.
- [x] Acesso real ao Bedrock validado.
- [ ] Dados materializados sem cópia do primeiro workspace.
- [ ] Cinco serviços confirmados online.
- [ ] Quatro interfaces abertas através dos URLs AWS.
- [ ] Login do Monitoring e fluxo funcional verificados.
