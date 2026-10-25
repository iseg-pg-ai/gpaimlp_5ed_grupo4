# Operações, monitoring e deployment

Estado revisto em 23 de outubro de 2026. O sistema funciona localmente no
SageMaker Code Editor; ainda não existe um deployment de produção aprovado.
Este documento separa o que está implementado das decisões ainda abertas.

## Estado operacional atual

| Componente | Execução | Estado persistente |
| --- | --- | --- |
| Portal | Next.js/Node com subprocessos Python, porta 3001 | Catálogo e entregas |
| Apresentação | Servidor estático Python, porta 3003 | Nenhum |
| Monitoring | Servidor Python autenticado, porta 3004 | Contas, eventos, incidentes e backups locais/S3 |
| Agente | FastAPI opcional, porta 8000 | Logs operacionais reduzidos |
| Observatório | Streamlit, porta 8501 | Lê o warehouse sem o alterar |
| ETL | Processo invocado sob pedido | Publica o warehouse de forma atómica |

Os comandos locais, portas e configuração do Studio estão no
[README](../README.md). A operação detalhada do painel está no
[guia de Monitoring](../monitoring/README.md) e os procedimentos de incidente no
[runbook](MONITORING_RUNBOOK.md).

O Monitoring recolhe saúde dos serviços, eventos reduzidos do portal e do agente,
estado do warehouse, disco, backups locais/S3 e incidentes deduplicados. Não guarda
prompts, respostas, passwords, tokens ou conteúdo de clientes. Como está na mesma
máquina, não consegue observar a indisponibilidade total do ambiente.

## Recuperação local

`just blu up` é o arranque diário. Mantém processos ativos, inicia apenas os
serviços parados, verifica os cinco endpoints e abre as quatro interfaces. Não
cria checkpoints, não para serviços e não executa recuperação.

`just blu it` é a recuperação integral. Exige autenticação interativa de uma
conta ativa com perfil `admin` do Monitoring e executa:

1. criação e confirmação remota do checkpoint identificado da execução;
2. paragem dos cinco serviços e confirmação das portas livres;
3. recuperação do checkpoint identificado da execução ou fallback para as
   releases do bucket de dados;
4. validação do ambiente e sincronização das dependências bloqueadas;
5. testes Python, Monitoring e portal;
6. build do portal;
7. arranque e verificação dos cinco serviços;
8. abertura das quatro interfaces.

O agente na porta 8000 é validado sem abrir um separador. Dados válidos são
preservados. O arranque exige as releases S3 de fontes e estado operacional ou
um checkpoint verificado; não existe um warehouse versionado como fallback. O log técnico fica em
`monitoring/runtime/recovery/just-blu-it.log`.

O transporte de fontes, warehouse e estado operacional está em
[Dados e ETL](DATA_PIPELINE.md#origem-etl-em-s3).

Estes comandos não renovam tokens SageMaker, não criam infraestrutura AWS e não
substituem redundância entre regiões/contas, DNS, TLS, identidade ou regras de rede.

### Exceções que exigem intervenção humana

- O `just blu it` exige uma conta ativa do Monitoring com perfil `admin` e lê a
  palavra-passe apenas no terminal interativo. Automação, logs e agentes não devem
  receber, guardar ou contornar essa credencial.
- Num workspace novo, os processos podem estar saudáveis sem que o proxy web do
  SageMaker aceite os URLs `/ports/`. As portas 3001, 3003, 3004 e 8501 devem ser
  adicionadas no painel **Ports** do Code Editor aberto no browser. O painel de
  uma sessão VS Code local/remota cria apenas túneis `127.0.0.1`.
- A execução de 23 de outubro confirmou checkpoint S3, paragem, recuperação e
  reinício até à tarefa 11. A causa da interrupção foi corrigida e os testes de
  navegador passaram isoladamente. A repetição integral exige decisão e login de
  um administrador e fica classificada como operação manual, não como falha de
  implementação ou tarefa de desenvolvimento pendente.
- A role da aplicação não pode consultar ou alterar Versioning, Default
  Encryption, Block Public Access ou lifecycle. Estas verificações pertencem a
  uma sessão administrativa AWS.
- Não se aplica lifecycle sem consultar primeiro as regras existentes, porque a
  escrita substitui a configuração completa. Consultar o procedimento em
  [Retenção dos buckets S3](S3_RETENTION.md#exceções-e-validações-manuais).

Estas limitações não impedem os backups S3 já validados. Delimitam apenas a
administração do bucket e a confirmação final do protocolo autenticado.

## Persistência e recuperação

O S3 protege separadamente:

- releases de fontes Excel/PDF e suplementos;
- releases operacionais com catálogo, histórico, versões, PDFs e filas;
- releases validadas do warehouse;
- checkpoints integrais no bucket de backups;
- contas e evidência operacional em `monitoring/runtime/`.

O Git não é backup destes dados. O backup local do Monitoring verifica hashes,
integridade SQLite e um restauro isolado, mas continua sujeito à falha da mesma
máquina. Reverter código não implica reverter dados; alterações de esquema exigem
compatibilidade e plano próprios.

O procedimento de recuperação integral para os processos, recupera o estado,
reconstrói o ETL e materializa uma cache em `/tmp/blu-runtime-<uid>`. `uv sync`,
`npm ci` e o build recompõem dependências e artefactos efémeros. Os checkpoints
ficam fora do projeto em `BLU_BACKUP_DIR` e no bucket de backups.

Cada checkpoint tem data, hora, identificador aleatório, versão de esquema,
estado e inventário por recurso. A publicação é atómica e só ocorre depois da
verificação de hashes e SQLite. Um checkpoint corrompido é registado em
`monitoring/runtime/recovery/checkpoint-events.jsonl` e o arranque procura uma
versão válida anterior. O restauro nunca substitui um ficheiro existente.
Credenciais, sessões, tokens e dados privados do editor são excluídos.

Quando `BLU_BACKUP_S3_BUCKET` está definido, a mesma operação conserva a cópia
local e publica também um arquivo cifrado no bucket existente, usando as
credenciais IAM normais do ambiente. Não existem chaves AWS no projeto. Os
objetos são imutáveis e organizados por ambiente, tipo e data. O upload e o
download confirmam tamanho, SHA-256, identificador e manifesto; se não houver um
checkpoint local válido, o restauro procura a cópia S3 válida mais recente.

```bash
export BLU_BACKUP_S3_BUCKET=nome-do-bucket-existente
export BLU_ENVIRONMENT=staging
export BLU_BACKUP_S3_PREFIX=blu-backups
# Opcional; sem esta variável é usada encriptação S3 AES-256.
export BLU_BACKUP_S3_KMS_KEY_ID=alias/chave-existente
python3 -B -m monitoring.checkpoint create --remote-required
```

Não existe eliminação remota automática. A retenção deve ser aprovada e aplicada
como lifecycle policy do bucket. O estado técnico do último upload/download, das
bases SQLite e das filas pendentes aparece no cartão de backup do Monitoring.
O papel IAM precisa apenas de `s3:ListBucket`, `s3:GetObject` e `s3:PutObject` no
prefixo configurado; com KMS, acrescentar as permissões da chave já existente.

Restauro manual de uma versão, limitado a ficheiros ausentes:

```bash
BLU_BACKUP_DIR=/caminho/externo python3 -B -m monitoring.checkpoint \
  restore-missing --backup-id IDENTIFICADOR
```

O restauro republica o estado recuperado como uma nova release operacional ativa.
É repetível: chaves idempotentes impedem revisões duplicadas e os JSON pendentes
só desaparecem depois da confirmação SQL e S3. Se o checkpoint mais recente estiver
corrompido, o launcher regista o problema e procura uma versão válida anterior.

Na validação de 23 de outubro de 2026, a cache foi reconstruída a partir dos dois
buckets, as bases SQLite e os hashes dos PDFs foram comparados e os serviços
responderam sem dados persistentes no checkout. Uma reconstrução sem checkpoint
local demorou 63,291 segundos neste ambiente; é uma medição, não um objetivo de
RTO. Para operações confirmadas pela API, o RPO observado foi zero. Uma transação
SQL ainda não confirmada no S3 permanece na outbox e pode perder-se se a máquina
desaparecer antes da repetição.

## Sinais e resposta

| Área | Sinais disponíveis ou necessários |
| --- | --- |
| Serviços | Disponibilidade, latência e alterações de estado |
| Portal | Navegação, operações, falhas de API e erros reduzidos |
| Dados | Idade e validação da publicação ETL |
| Persistência | SQLite, filas pendentes, cópias local/S3 e último restauro |
| IA | Chamadas, falhas, latência e tokens quando reportados |
| Incidentes | Abertura, deduplicação, recuperação local e transporte SNS configurável |

Um HTTP 200 não comprova um fluxo completo, acesso ao Bedrock ou validade dos
dados. Os limiares locais são preliminares até existirem objetivos operacionais.
Cada alerta de produção precisará de responsável, canal e ação de recuperação.
O transporte SNS conserva uma fila local, repete falhas com atraso exponencial e
expõe entregas e pendências no painel. O tópico privado, a subscrição confirmada,
o `sns:Publish` limitado ao respetivo ARN e a entrega real foram validados em
25 de outubro de 2026. A ativação continua a ser configuração local por ambiente.

## Base operacional proposta

Esta é a recomendação inicial da Etapa 1 do [plano](../PLAN.md), ainda sujeita a
aprovação antes de criar infraestrutura ou custos. Mantém uma única instância
escritora, compatível com o SQLite atual, mas retira o ciclo de vida dos processos
da persistência operacional.

| Decisão | Recomendação | Razão |
| --- | --- | --- |
| Região | `eu-west-1` | Mantém dados, buckets, Bedrock e operação na região atual |
| Demonstração | SageMaker atual, sem garantia de disponibilidade | Preserva o ambiente de desenvolvimento já validado |
| Staging e produção | Serviços ECS separados, cada um com uma tarefa ativa | Permite reinício gerido sem fingir que SQLite suporta várias réplicas |
| Entrada web | Application Load Balancer com TLS e rotas por componente | Substitui o proxy temporário `/ports/` por endpoints estáveis |
| Identidade | Um Amazon Cognito User Pool por ambiente | Evita contas distintas no portal e no Monitoring |
| Papéis | `owner`, `admin`, `curator` e `viewer` | Separa infraestrutura, gestão, edição e consulta |
| Segredos | AWS Secrets Manager, injetado apenas no serviço necessário | Evita `.env`, chaves e passwords dentro das imagens |
| Estado operacional | EFS cifrado para SQLite, histórico, outbox e exports | Uma escrita confirmada sobrevive à substituição da tarefa antes do envio S3 |
| Estado permanente | Releases imutáveis no S3 já existente | Conserva recuperação, integridade e histórico fora da tarefa |
| Escala inicial | Uma tarefa escritora; sem escala horizontal automática | Respeita os limites concorrentes comprovados do SQLite |
| Checkpoints | Apenas estado operacional | Fontes e warehouse já têm releases próprias e não devem ser duplicados |
| Rascunhos | Privados por utilizador e viagem, sincronizados no servidor | Permite continuidade entre dispositivos sem misturar trabalho não publicado |

### Identidade e autorização propostas

| Papel | Capacidades principais |
| --- | --- |
| `owner` | Configuração do espaço, administradores, retenção e operações reforçadas |
| `admin` | Utilizadores, catálogo, Monitoring e recuperação operacional |
| `curator` | Briefings, rascunhos, propostas, versões, exports e partilhas autorizadas |
| `viewer` | Consulta de viagens, versões e sinais expressamente partilhados |

Clientes externos não recebem um papel interno. Continuam a usar partilhas
revogáveis, limitadas no tempo e sem acesso ao workspace. O backend aplica o papel
e o ownership; esconder botões no frontend não constitui autorização. O agente
herda sempre o âmbito do utilizador e nunca eleva permissões.

Contas são criadas por convite administrativo, exigem credencial individual e
podem ser desativadas sem apagar auditoria ou versões. A autenticação local do
Monitoring permanece apenas durante a migração e deve ser retirada depois de o
Cognito proteger portal e Monitoring.

### Objetivos propostos para aprovação

| Objetivo | Staging | Produção inicial |
| --- | --- | --- |
| Disponibilidade mensal | Melhor esforço | 99,5% |
| RPO de escritas confirmadas | 15 minutos | 5 minutos |
| RTO | 4 horas | 60 minutos |
| Retenção de conversa do agente | 30 dias | 30 dias |
| Auditoria técnica e de alterações | 90 dias | 365 dias |
| Partilhas expiradas | Remoção após 30 dias | Remoção após 30 dias |

O EFS persistente reduz a janela SQLite → S3, mas não substitui releases e
backups. O objetivo final é que uma escrita só seja apresentada como durável
depois do commit no EFS e do registo idempotente na outbox persistente; a publicação
S3 pode ser repetida após reinício. RPO zero só deve ser prometido depois de testes
de falha reais e, se necessário, publicação S3 síncrona no percurso crítico.

### Fluxo proposto

```mermaid
flowchart LR
    U[Utilizador] --> ALB[ALB com TLS]
    ALB --> AUTH[Cognito]
    AUTH --> ECS[ECS · uma tarefa escritora]
    ECS --> EFS[EFS cifrado · SQLite e outbox]
    ECS --> S3[S3 · releases e backups]
    ECS --> SM[Secrets Manager]
    ECS --> CW[Logs e métricas]
    CW --> SNS[SNS validado]
```

Esta base não cria recursos nem fecha as decisões. A aprovação deve confirmar,
no mínimo, papéis, rascunhos sincronizados, objetivos, retenção e aceitação de uma
única tarefa escritora. Depois disso podem ser produzidos manifests e estimativa
de custos sem alterar a operação atual.

## Deployment ainda por decidir

Antes de escolher plataforma, definir:

- demonstração, staging e produção;
- utilizadores, identidade, papéis e exposição;
- disponibilidade, perda de dados e tempo de recuperação aceitáveis;
- região, orçamento e responsável operacional;
- política de retenção, redundância entre regiões/contas e dados pessoais;
- cadência e aprovação da publicação ETL.

As alternativas em análise são:

| Alternativa | Adequação | Limite principal |
| --- | --- | --- |
| SageMaker atual | Desenvolvimento e demonstração | Sessão, proxy e máquina única |
| VM dedicada | Primeira operação controlada com uma instância escritora | Ponto único de falha e operação da máquina |
| Serviços geridos | Maior disponibilidade futura | Exige redesenhar persistência, concorrência e deployment |

SQLite e ficheiros locais favorecem inicialmente uma única instância escritora.
Escalar horizontalmente exige rever catálogo, bloqueios, versões e armazenamento
dos PDFs. Nenhuma alternativa está aprovada ou instalada como produção.

Em 24 de outubro de 2026, testes com processos Node independentes confirmaram que
`BEGIN IMMEDIATE` e as revisões-base deixam apenas uma edição concorrente avançar
no catálogo e apenas uma versão suceder à mesma versão anterior. O segundo
escritor recebe conflito e não cria duplicados. Esta evidência cobre processos na
mesma máquina e no mesmo SQLite, não várias réplicas ou máquinas.

Os rascunhos permanecem no `localStorage` e são intencionalmente privados ao
navegador. Dois utilizadores não veem nem conciliam o mesmo rascunho. Antes de
uma operação multiutilizador é necessário escolher entre conservar esse modelo
privado ou criar sincronização autenticada com ownership, revisão e resolução de
conflitos; não se deve transformar o catálogo ou o S3 numa segunda fonte de
rascunhos por acidente.

O `Dockerfile.portal` cobre apenas o portal Node. Não inclui a materialização S3,
ETL, Observatório, Monitoring, apresentação ou agente. Uma futura arquitetura com
load balancer ou CDN terá de encaminhar as rotas dinâmicas e `/_next/static/*`
para o mesmo build, validar APIs e assets e definir health checks, cache, TLS,
rede e rollback. Essa infraestrutura ainda não existe neste repositório.

## Fluxo de entrega pretendido

```mermaid
flowchart LR
    PR[Alteração] --> CI[Testes e verificações]
    CI --> ART[Artefacto identificado]
    ART --> ST[Staging com dados isolados]
    ST --> SM[Smoke tests e restauro]
    SM --> AP[Aprovação]
    AP --> OP[Operação monitorizada]
    OP -. falha .-> RB[Rollback compatível]
```

Código, publicação ETL e migrações de dados têm ciclos distintos. O staging deve
usar catálogo, warehouse e exports próprios. A mesma entrega testada deve ser
promovida sem incluir segredos ou dados operacionais na imagem.

## Pendências para produção

A fonte de verdade das tarefas abertas é a secção
[Pendências de monitoring](../PLAN.md#pendências-de-monitoring). Neste momento
faltam:

- sonda executada fora da máquina;
- limiares e escalamento finais associados aos responsáveis de produção;
- decisão de hosting, identidade central, CI do portal, staging e rollback.

Não considerar o monitoring completo nem o deployment pronto enquanto estes
pontos não tiverem implementação e evidência de validação.
