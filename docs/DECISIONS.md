# Decisões técnicas vigentes

Revisto em 24 de outubro de 2026. Este documento reúne apenas decisões que ainda
condicionam a arquitetura, o produto ou a operação. Relatos de execução, resultados
de testes, integrações de branches e decisões substituídas permanecem no histórico
Git. O código, os manifests e os documentos especializados prevalecem se existir
alguma divergência.

As tarefas ainda abertas estão no [plano](../PLAN.md).

## Dados e persistência

### S3 é a persistência permanente — 2026-10-23

O bucket de dados conserva releases imutáveis e separadas de:

- fontes originais;
- warehouse validado;
- estado operacional do portal.

A release operacional inclui catálogo, histórico de itinerários, partilhas, PDFs e
operações pendentes. O apontador ativo só muda depois da publicação e validação de
todos os objetos e hashes. Uma eliminação deixa de integrar a release ativa, mas as
releases e checkpoints anteriores permanecem disponíveis segundo a política de
retenção.

A máquina materializa uma cache efémera sob `/tmp`. SQLite é usado nessa cache
porque o deployment atual tem um único escritor e precisa de transações locais; não
é a persistência permanente. Portal e Observatório recebem os caminhos da cache por
variáveis de ambiente.

### O estado operacional é independente do ETL — 2026-10-22

O ETL transforma fontes e publica apenas o warehouse validado. Não controla o
catálogo, as versões, as partilhas, os PDFs nem as operações pendentes do portal.
A reconstrução do warehouse não pode eliminar ou substituir estado operacional.

Alterações de catálogo e versões usam chaves idempotentes e uma fila JSON
transitória quando o SQLite não está disponível. A fila entra nas releases e nos
checkpoints, mantém a ordem e só remove uma operação depois da confirmação SQL e da
publicação exigida pelo fluxo. Não constitui uma segunda fonte de verdade.

### Dados desconhecidos mantêm-se desconhecidos — 2026-10-12

Ausência de preço, horário, disponibilidade, acessibilidade ou compatibilidade não
pode ser convertida em zero ou numa confirmação. Custos conhecidos, pendências e
moedas permanecem separados. A entrega exige revisão humana quando faltam dados ou
existem conflitos.

### Fontes são protegidas e o warehouse pertence ao pipeline — 2026-10-12

Excel, PDF e suplementos são entradas protegidas. Regras editoriais ficam em
`config/curation_rule_overrides.json`, sem alterar as fontes brutas. O ETL constrói,
valida e publica atomicamente o warehouse; aplicações consomem-no em modo de
leitura e não editam os artefactos manualmente.

## Recuperação e operação

### Colegas partilham a role de ensino em workspaces isolados — 2026-10-24

O onboarding foi validado num segundo SageMaker Code Editor criado de raiz. Por
decisão do ambiente académico, os colegas podem assumir a mesma
`SageMakerTeachingExecutionRole`; não é obrigatório criar uma role por pessoa.

O isolamento exigido aplica-se ao workspace, URL Studio, clone, configuração
local, conta do Monitoring e cache efémera. Não se copiam credenciais, sessões,
catálogo, exports ou caches entre colegas. O ensaio comprovou S3, Bedrock,
recuperação integral, testes, cinco serviços e quatro interfaces. Esta decisão não
equivale ao desenho de identidade para produção, que continua por definir.

### Releases S3 são inventariadas antes de qualquer retenção — 2026-10-24

O inventário de fontes e warehouse valida manifestos e hashes sem alterar o
bucket. A release válida mais recente é `active`, as válidas anteriores são
`superseded` e manifestos incompatíveis ou corrompidos são `invalid`. Se a release
mais recente for inválida, a anterior válida permanece ativa, como no restauro.

Esta classificação é evidência para uma futura política de retenção, não uma
autorização de eliminação. A role da aplicação continua sem `s3:DeleteObject`.

### Os buckets de dados e backups têm responsabilidades distintas — 2026-10-22

O bucket de dados contém o estado ativo e as releases de fontes e warehouse. O
bucket de backups contém checkpoints imutáveis para recuperação. Ambos usam IAM do
ambiente, encriptação S3 e validação por tamanho e SHA-256; a aplicação não contém
credenciais AWS nem elimina objetos remotamente.

Não se aplica expiração a releases válidas até existir uma forma aprovada de marcar
as versões substituídas. Configuração administrativa de versionamento, Block Public
Access e lifecycle pertence a uma identidade AWS própria, mantendo a role da
aplicação com privilégio mínimo.

### `just blu up` e `just blu it` têm contratos diferentes — 2026-10-23

`just blu up` inicia apenas os serviços parados, confirma endpoints e abre as
interfaces. Não cria checkpoints, não para serviços e não executa recuperação.

`just blu it` exige autenticação administrativa, cria e valida um checkpoint, para
os serviços, recupera a versão identificada ou a release ativa, sincroniza operações
pendentes, reconstrói o warehouse quando necessário, inicia os serviços e executa os
testes finais. Um backup inválido ou uma falha que possa comprometer dados impede a
continuação destrutiva.

Os backups locais ficam fora do projeto. Credenciais, sessões, tokens, ambientes e
estado privado do editor não entram em checkpoints.

### Um checkout novo não inventa dados — 2026-10-23

A preparação local cria configuração e credenciais próprias, mas os dados são
materializados a partir de releases S3 autorizadas. Sem release ou checkpoint
válido, o sistema só permite uma inicialização vazia e controlada. Contas, catálogo
e exports de outra máquina não são copiados implicitamente.

## Portal e curadoria

### A decisão final pertence ao curador — 2026-10-12

Regras determinísticas e catálogo aprovado prevalecem sobre sugestões do modelo.
Alterações propostas pelo agente são pré-visualizadas, validadas e aceites ou
rejeitadas pelo utilizador. Atividades protegidas e confirmações concluídas não são
alteradas automaticamente.

Alterações do utilizador, alterações do agente e bloqueios explícitos são estados
distintos. Uma edição do agente não bloqueia o dia. Regenerações preservam trabalho
manual, atividades protegidas e confirmações.

### Versões publicadas são imutáveis — 2026-10-12

Cada versão guarda snapshot, relação parental, revisão, hash e bytes PDF. Escritores
obsoletos não podem substituir revisões recentes. Uma alteração posterior ao
catálogo ou ao itinerário não modifica versões ou PDFs anteriores.

O Lixo retira versões da vista ativa sem destruir imediatamente o respetivo
snapshot. O restauro precede nova exportação. Partilhas mantêm a versão e o idioma
selecionados e precisam de política operacional de acesso, retenção e revogação
antes de produção multiutilizador.

### O portal usa largura fluida e tema explícito — 2026-10-18

As páginas usam contentores fluidos e margens responsivas comuns, sem um limite
fixo diferente por rota. O tema claro é o padrão; a opção escura é guardada no
navegador e sincronizada entre separadores. Impressão, PDFs e o Observatório
analítico mantêm apresentação própria.

## Assistente de IA

### O agente altera apenas itinerários através de ações estruturadas — 2026-10-21

O agente opcional suporta o conjunto de operações de itinerário definido no schema
partilhado. Não altera diretamente briefing, catálogo ou confirmações manuais. O
servidor valida o plano, permissões, revisão e impacto antes de persistir uma ação
aceite. Conversas são locais por viagem e não se guardam prompts completos nos logs.

Ranking, aprendizagem por feedback, recuperação de casos históricos e ações
proativas exigem uma iteração e critérios de aceitação próprios. Chamadas reais a
modelos exigem autorização, orçamento e revisão de privacidade; testes usam modelos
simulados por defeito.

### O agente usava a API atual de LangChain — 2026-10-23 (substituída)

A fábrica usa `langchain.agents.create_agent`, ferramentas de domínio e o modelo
Esta decisão descreve a implementação anterior, removida em 25 de outubro de
2026 a favor do planeador transacional invocado diretamente pelo Portal.
LangChain/LangGraph pertenciam ao grupo Python opcional
`agent`. Falta de credenciais ou indisponibilidade do fornecedor produz falha
explícita, sem resposta fictícia ou fallback secreto para outro fornecedor.

### O cálculo rodoviário pertence a Python — 2026-10-20

Consulta do fornecedor, validação e fallback geométrico pertencem a
`portal/routing.py`. O adaptador TypeScript preserva o contrato do portal enquanto a
ordenação e os resumos restantes são migrados incrementalmente. Estimativas de
fallback são identificadas como não otimizadas.

## Entregas e idiomas

### Tradução é local e preserva valores estruturados — 2026-10-12

A tradução opcional usa modelos locais e não envia conteúdo de clientes a um
fornecedor externo. Números, preços, horários, moedas e identificadores são
protegidos; uma alteração não recuperável falha explicitamente. Mandarim exige uma
fonte CJK configurada para PDF. Em 24 de outubro de 2026, Noto Sans CJK SC foi
validada num segundo workspace com modelos reais, teste do renderer e exportação
pela interface, preservando valores estruturados e sem falhas visuais observadas.

### Prompt TXT deriva de uma versão guardada — 2026-10-24

A exportação TXT usa o snapshot selecionado e exclui contactos, referências de
reserva e notas internas. Não altera o estado dos PDFs DMC. O contrato
`blu-roteiro-prompt/1.0.0` é neutro quanto à ferramenta de destino; qualquer
documento derivado permanece sujeito à revisão do curador e não substitui
automaticamente um PDF publicado.

O percurso real foi validado no segundo workspace em 24 de outubro de 2026. O
portal descarregou o prompt com a identificação e versão esperadas, instruções
neutras e o bloco JSON da proposta, sem configuração de fornecedor ou modelo
visual.

Fotografias só podem integrar entregas depois de autorização, licença e créditos
serem documentados.

### Partilhas expiram e são revogáveis — 2026-10-24

Uma nova partilha exige confirmação explícita da autorização do destinatário e
uma validade de 7, 30 ou 90 dias. O registo conserva versão, idioma, método,
destinatário, consentimento, validade e revogação para auditoria até à eliminação
definitiva da versão. Partilhas antigas sem estes campos e ligações expiradas ou
revogadas falham fechadas.

Enviar uma versão para o Lixo revoga todas as respetivas ligações na mesma
transação. Restaurar a versão não restaura acessos; o curador cria uma partilha
nova se ainda existir autorização. A gestão manual fica no Histórico. Este
controlo não substitui a identidade central e a política global de dados pessoais
que permanecem na prioridade de operação multiutilizador.

## Observatório e apresentação

### O Observatório é analítico e de leitura — 2026-10-18

O dashboard da porta 8501 lê exclusivamente o warehouse publicado. Não chama o
agente, não escreve no catálogo e não altera o ETL. Indicadores distinguem ausência
de dados de valores confirmados; o mapa agrega pontos próximos sem esconder o
acesso aos detalhes.

### A apresentação é uma aplicação independente — 2026-10-18

A apresentação da porta 3003 é estática e não usa APIs ou dados operacionais. Os
exemplos são ilustrativos e o estado fica em memória. Animações respeitam movimento
reduzido e podem ser desativadas sem perder conteúdo ou navegação. O último ato abre
o portal ou Observatório configurado num separador próprio.

## Monitoring e segurança

### Monitoring é independente e exige autenticação — 2026-10-19

O Monitoring funciona na porta 3004, apenas em loopback atrás do proxy HTTPS do
Studio. Perfis `admin` e `viewer` são autorizados no servidor; alterações exigem
CSRF. Não é possível remover, desativar ou despromover o último administrador
ativo. Alterações de conta revogam as sessões relevantes.

Credenciais derivadas, palavra-passe inicial, sessões e runtime ficam em
`monitoring/runtime/`, fora do Git. A gestão local de contas não substitui uma
decisão futura de identidade central para produção.

### A telemetria é reduzida e privada — 2026-10-19

Eventos operacionais não guardam passwords, tokens, prompts, respostas, corpos de
pedidos, contactos ou dados de clientes. Mensagens e stacks são limitadas e
redigidas. Como o portal ainda não tem identidade própria, eventos usam apenas a
sessão aleatória do separador, `server` ou `system`; não atribuem uma ação a uma
pessoa.

A limpeza automática atua apenas sobre caches regeneráveis e backups do próprio
Monitoring, conserva pelo menos cinco cópias completas e respeita idade e limiar de
disco. Fontes, catálogo, warehouse, exports, credenciais, ambientes e dependências
ficam fora do seu alcance.

A sonda fora da máquina continua aberta no [plano](../PLAN.md); logs e sondas
locais não constituem monitoring de produção.

### SNS é o transporte externo validado para incidentes — 2026-10-25

O Monitoring possui uma integração SNS opcional, desativada por defeito no
repositório. Publica
apenas a abertura e a recuperação de incidentes técnicos, através da role IAM do
ambiente e de um tópico indicado por variável local. A fila e o estado de entrega
são persistentes; falhas são repetidas com atraso exponencial e eventos entregues
não são reenviados durante a operação normal.

O tópico real, a subscrição confirmada e a permissão `sns:Publish` limitada ao ARN
foram validados em `eu-west-1`. Um ensaio técnico entregou uma abertura e uma
recuperação, deduplicou a repetição da abertura e terminou com duas entregas e zero
pendências. A repetição após falha permanece validada por teste com falha injetada,
evitando remover permissões reais apenas para provocar um incidente. A sonda
externa depende ainda de um endpoint estável fora da máquina observada.

## Configuração e dependências

### Percurso único do agente Nova Pro — 2026-10-25

O portal, a fachada HTTP privada e a compatibilidade histórica usam agora o mesmo
planeador transacional e o contrato de onze ações. A geração autónoma LangGraph
foi descontinuada porque não tinha viagem, versão-base, pré-visualização nem
aceitação explícita. O endpoint histórico correspondente responde `410`.

Amazon Bedrock Converse com Nova Pro é o único fornecedor do agente. Não existe
fallback silencioso. O backend volta sempre a validar o
`AgentPlan`; o modelo não recebe ferramentas de escrita. Os testes automáticos
usam um cliente Bedrock simulado, sem chamadas pagas.

O contexto explícito passou a incluir locais, horas e números de voo de chegada e
partida, além da ocasião especial. Nome, email, notas livres, contactos e
referências de reserva continuam excluídos. A memória por utilizador aguarda uma
identidade autenticada no backend; aceitar um `ownerId` enviado pelo browser
violaria o contrato de autorização já aprovado.

### Identidade do agente validada no backend — 2026-10-25

O modo cloud valida o JWT de claims assinado pelo ALB e o access token assinado
pelo Cognito através da biblioteca oficial `aws-jwt-verify`. O backend confirma
ARN do ALB, issuer, client ID, expiração e igualdade do `sub`; não usa
`x-amzn-oidc-identity` como prova. Grupos desconhecidos não concedem permissões e
a ausência de grupo aplica `viewer`.

As propostas passam a guardar ownership. Apenas o mesmo principal com
`agent.approve` pode aceitar, rejeitar ou selecionar alternativas. A memória
servidor é ativada pelo mesmo principal e fica isolada por utilizador, viagem e
versão. `BLU_IDENTITY_MODE=disabled` preserva o funcionamento SageMaker, mas não
simula multiutilizador nem ativa memória autoritativa.

A matriz de ferramentas do agente é fechada e tipada. Inclui apenas leitura de
viagem/catálogo e o ciclo transacional já existente de propor, aceitar, rejeitar
e escolher alternativas. A permissão do papel é verificada no backend e as
operações de escrita exigem a decisão explícita recebida pela rota. Capacidades
administrativas, destrutivas e de infraestrutura não são expostas ao agente.

### Base cloud e multiutilizador aprovada — 2026-10-25

Foi aprovada como arquitetura-alvo inicial uma implantação em `eu-west-1`, com
demonstração no SageMaker e staging/produção isolados. A entrada pública usará um
Application Load Balancer com TLS; a identidade será centralizada em Amazon
Cognito e os segredos em AWS Secrets Manager.

Os papéis internos são `owner`, `admin`, `curator` e `viewer`. Clientes externos
continuam limitados a partilhas revogáveis e não recebem acesso ao workspace. O
backend aplica papel e ownership; o agente herda sempre o âmbito do utilizador.

Para preservar os contratos atuais, cada ambiente começa com uma única tarefa
escritora em ECS. SQLite, outbox, histórico e exports ficam num EFS cifrado; o S3
continua a conservar releases e backups. Não se ativa escala horizontal enquanto
o estado operacional depender de SQLite. Rascunhos passam a ser privados por
utilizador e viagem, mas sincronizados no servidor para continuidade entre
dispositivos.

Os checkpoints futuros conservam apenas estado operacional, porque fontes e
warehouse já têm releases próprias. Os objetivos iniciais aprovados para produção
são 99,5% de disponibilidade mensal, RPO de cinco minutos e RTO de sessenta
minutos. Conversas do agente conservam-se por 30 dias, auditoria por 365 dias e
partilhas expiradas por mais 30 dias, sujeitos a execução e revisão jurídica antes
de produção.

A aprovação autoriza preparar código, contratos e infraestrutura como código. Não
autoriza por si só criar recursos, publicar endpoints ou assumir custos AWS.

### Retenção é central, executável e conserva versões — 2026-10-25

Os prazos ficam em `config/retention_policy.json`, validados antes da execução.
Rascunhos inativos expiram após 90 dias, auditoria do agente após 365 dias e
metadados de partilhas 30 dias depois do fim do acesso. Conversas futuras terão 30
dias. Preservação legal impede qualquer destas eliminações.

A limpeza não elimina versões autoritativas nem PDFs; estes continuam dependentes
do Lixo, das confirmações e do ciclo de vida da versão. Os testes executam apenas
em diretórios temporários e confirmam que uma limpeza não quebra versões, exports
ou registos sob preservação.

### Write-ahead fecha a janela de processo SQLite → S3 — 2026-10-25

Catálogo e versões guardam a operação validada antes do commit SQLite. Só removem
esse write-ahead depois de criar a outbox S3. Se o processo parar entre estes dois
passos, a repetição reconhece a chave idempotente já confirmada em SQL, cria a
outbox e não duplica a revisão.

O comportamento foi validado bloqueando deliberadamente a criação da outbox após
o commit. Catálogo e versões recuperaram no reinício, conservaram uma única revisão
e voltaram a produzir o evento S3. A perda da máquina inteira continua limitada
pelo RPO aprovado até `BLU_OPERATIONAL_DIR` residir no EFS da arquitetura-alvo.

### Infraestrutura do Curation Studio tem stack isolada — 2026-10-25

O Curation Studio não reutiliza a stack do site público e WhatsApp existente em
`infra/aws-split-app.mjs`. A sua entrada independente é
`infra/curation-workspace.mjs`, para evitar ownership, dados e ciclos de deployment
misturados.

A síntese local confirmou uma única tarefa Fargate com cinco containers, EFS
cifrado e retido, ALB apenas em HTTPS, Cognito com os quatro papéis, Secrets Manager
e ausência de NAT Gateway. A stack exige uma imagem ECR identificada, certificado,
domínio, buckets e SNS como parâmetros. Não foi executado deployment nem criado
qualquer recurso.

### A configuração Studio é individual — 2026-10-19

Cada instalação guarda a origem pública em `config/studio.local.json`, ignorado
pelo Git e criado por `scripts/setup_workspace.py` a partir do exemplo versionado.
Os URLs das portas derivam dessa origem; endereços locais servem apenas para probes
e execução direta. A configuração não cria domínios nem renova tokens SageMaker.

### Manifests e lockfiles são autoritativos — 2026-10-15

`pyproject.toml` e `uv.lock` definem Python; `package.json` e `package-lock.json`
definem cada aplicação Node. Requirements são exports gerados. O ambiente Python
base contém apenas ETL; dashboard, agente e tradução são grupos opcionais. O projeto
exige Python 3.12 ou 3.13, Node entre 22.13 e 24 e `uv 0.12.19`.

A exceção Stanza/Argos está documentada em
[Dependências Python](DEPENDABOT_PYTHON.md) e deve ser revista quando o Argos
publicar um requisito compatível corrigido.

### Entregas CI têm contrato versionado e dados sintéticos — 2026-10-24

O manifesto do warehouse declara `schema_version`. O gate
`scripts/check_warehouse_release.py` recusa versões incompatíveis, ficheiros
obrigatórios em falta, validação reprovada, erros PDF e conflitos sem exceção
auditável. Uma exceção identifica exatamente tabela, registo e campo, bem como
responsável, justificação e validade; exceções expiradas ou sem conflito também
falham.

O CI não usa fontes comerciais. Gera um conjunto sintético e testa o percurso
catálogo aprovado → ETL → geração → confirmação → versão → PDF. O artefacto é
apenas diagnóstico e expira após 14 dias. As lacunas de preço, suplemento e
entidade descritas em [Preenchimento](DATA_ENRICHMENT.md) são aceites como
desconhecidas, nunca convertidas em zero ou em compatibilidade presumida.

### Cálculo autoritativo de percurso passa pela fronteira Python — 2026-10-24

O servidor do portal delega em `portal.routing` o cálculo de troços, a ordenação,
o realinhamento horário e o resumo diário. O adaptador TypeScript de ordenação
permanece temporariamente apenas no editor síncrono do agente e será tratado com
a próxima iteração desse agente; não é usado pelo fluxo rodoviário do servidor.

### SQLite suporta vários processos numa instância, não várias réplicas — 2026-10-24

Processos Node independentes foram executados em simultâneo contra o mesmo
catálogo e histórico de versões. Em ambos os casos, uma única escrita baseada na
revisão corrente foi aceite e a outra foi recusada como obsoleta, preservando a
sequência e evitando duplicados. O contrato é adequado a uma instância escritora
com SQLite partilhado.

Rascunhos continuam privados ao navegador e não têm concorrência distribuída.
SQLite não é apresentado como base multi-réplica: uma futura execução horizontal
exige outra persistência operacional ou um único serviço escritor, identidade e
ownership explícitos e testes entre máquinas.

### O agente cloud falha fechado por identidade, custo e fornecedor — 2026-10-25

O modo cloud valida a identidade assinada pelo ALB e Cognito, associa memória e
propostas ao utilizador e autoriza apenas ferramentas tipadas do itinerário. Cada
escrita continua sujeita a pré-visualização e confirmação explícita.

Antes de chamar o fornecedor, o backend exige modelo, teto mensal e preço por
milhão de tokens, reservando conservadoramente o custo máximo da resposta. O
timeout é configurável entre 5 e 120 segundos. Configuração incompleta, orçamento
esgotado, timeout ou indisponibilidade não alteram o roteiro e não acionam outro
modelo. Os valores comerciais permanecem uma decisão operacional por aprovar e
não são inventados no código ou na documentação.

### Base operacional da curadoria aprovada — 2026-10-25

A Etapa 1 foi aprovada com uma única tarefa escritora ECS, EFS cifrado e retido,
releases S3, entrada HTTPS por ALB, identidade Cognito, quatro papéis internos e
segredos fora da imagem. O Grupo 4 assume provisoriamente as responsabilidades
operacional e de segurança durante a fase académica.

O dimensionamento de staging considera cinco utilizadores, 2 vCPU, 4 GB, 730
horas/mês, 20 GB de EFS e 10 GB de logs. A estimativa bruta de referência é
121,27 USD/mês, excluindo consumos variáveis e impostos. O domínio ainda não foi
adquirido; imagem ECR, subdomínio, certificado e DNS são execução da Etapa 3 e
continuam sujeitos a autorização explícita antes de criarem recursos ou custos.

### O agente usa Nova Pro com ferramentas limitadas — 2026-10-25

O agente ativo permanece no Amazon Bedrock com Nova Pro. O backend fornece apenas
leituras sobre o contexto autoritativo minimizado e uma operação final de proposta;
o modelo não recebe acesso a SQL, S3, shell, reservas ou escrita no portal. O
contrato passou a treze ações, acrescentando alterações permitidas do briefing e
a preparação de confirmações ainda pendentes.

As regras TypeScript simulam a proposta. Uma falha pode originar uma única nova
chamada, contendo apenas um código sanitizado e uma instrução genérica. O texto
bruto não regressa ao modelo, o orçamento reserva as duas chamadas possíveis e a
segunda falha termina sem alterações. A qualidade semântica continua dependente
de uma avaliação Nova Pro real, separada e explicitamente autorizada.

### Feedback e memória histórica permanecem supervisionados — 2026-10-25

O feedback pós-viagem fica associado a uma única versão realizada e cobre todos
os cartões. A entrega é imutável. Comentários e notas são conservados para revisão
interna, mas nunca entram nas ferramentas do modelo. O agente recebe apenas
agregados, etiquetas e tendências de 30, 90 e 180 dias.

Um caso histórico só entra na memória após feedback completo, avaliação global
mínima de quatro em todas as atividades, ausência de incidentes e aprovação
humana. O índice usa perfil reduzido, identificadores e revisões; exclui identidade
do cliente, texto livre, PDFs e versões no Lixo. Feedback, alertas e precedentes
nunca alteram o catálogo automaticamente nem provam disponibilidade atual.

### O agente prepara entregas, mas não as executa autonomamente — 2026-10-25

O plano pode identificar PDF, Prompt TXT ou partilha, idioma e, nesta última,
ligação ou documento. Esta intenção não pode ser combinada com alterações ao
itinerário: a versão deve ser guardada primeiro. O servidor recalcula os
diagnósticos e bloqueia a continuação quando existem impedimentos.

A geração exige um clique explícito e reutiliza a exportação existente. Uma
partilha abre o formulário manual, onde o curador introduz destinatário, confirma
consentimento e escolhe retenção. O modelo não cria links, não recebe contactos e
não envia mensagens. Emails e números de telefone escritos no chat são removidos
antes de qualquer instrução ou memória ser enviada ao fornecedor.

### Meteorologia e percursos são leituras passivas do agente — 2026-10-25

O agente pode ler a meteorologia que o portal já tenha consultado e mantenha na
cache do servidor, bem como os troços que já estejam persistidos no itinerário. Pedir uma
proposta ao agente não desencadeia chamadas a fornecedores de meteorologia ou de
roteamento. A rota recupera a observação pela data, local e coordenadas do
snapshot autoritativo e reduz os campos antes de os entregar ao modelo; não
aceita observações fornecidas pelo navegador.

A evidência distingue previsão de referência histórica e percurso medido pelo
OSRM de estimativa. Dados ausentes, históricos ou estimados não são apresentados
como condições atuais, disponibilidade ou confirmação. As ferramentas apenas
leem o contexto minimizado; não escrevem no itinerário nem contornam a simulação
e a aceitação explícita.

### Perturbações e conteúdo produzem sinais, não confirmações — 2026-10-25

O portal calcula sinais reduzidos para chuva, encerramentos conhecidos, atrasos,
cancelamentos, mudanças de horário e possíveis problemas de conteúdo. Os sinais
de catálogo abrangem campos em falta, datas antigas mencionadas em descrições,
possíveis duplicados por nome e local e mistura linguística evidente. São indícios
conservadores para revisão, não diagnósticos de disponibilidade ou qualidade.

A ferramenta `get_supervision_signals` devolve apenas códigos, proveniência, dia
e identificadores. Distingue observação, referência histórica, informação
comunicada pelo utilizador e revisão necessária. O modelo pode explicar impacto
ou preparar uma alternativa através das ações já autorizadas, mas não altera o
catálogo, reservas, confirmações ou documentos e continua dependente de simulação
e aceitação humana explícita.

### As métricas do agente reutilizam a auditoria operacional — 2026-10-25

O Monitoring agrega `agent_runs` diretamente da base de histórico em modo só de
leitura. Apresenta propostas, respostas sem alteração, aceitações, rejeições,
pendentes, expirações, tokens, latência média e modelos. Os conflitos são contados
nos eventos técnicos do endpoint do assistente e têm uma janela explícita de 24
horas. Não foi criada uma segunda fonte de telemetria.

Custos só são apresentados quando `BLU_AGENT_RATES_JSON` contém tarifas de
entrada e saída válidas para todos os modelos registados. Na ausência de preços,
o painel mostra «Por configurar» em vez de inferir um custo. O agregado exclui
instruções, planos, respostas, motivos livres e dados de clientes; edições
posteriores permanecem uma contagem separada e não são atribuídas causalmente ao
agente.

### Nova Pro e um teto mensal de 10 USD são aprovados — 2026-10-25

Foi aprovado Amazon Bedrock como fornecedor único e o perfil
`eu.amazon.nova-pro-v1:0` em Standard On-Demand, sem fallback. Para EU (Ireland),
as tarifas aprovadas em 25 de outubro de 2026 são 0,92 USD por milhão de tokens
de entrada e 3,68 USD por milhão de tokens de saída. O teto operacional é 10 USD
por mês, com 1800 tokens máximos de saída, timeout de 35 segundos e no máximo duas
chamadas por pedido.

O backend reserva conservadoramente o custo máximo antes da chamada quando a
identidade cloud está ativa e falha sem alteração ao atingir o teto. IAM fornece
a autenticação e não existem chaves estáticas. Tarifas e modelo têm de ser
revalidados na fonte oficial da AWS antes de cada deployment ou mudança.

### A primeira avaliação real de Nova Pro não atinge o limiar — 2026-10-25

A bateria autorizada de 38 casos sintéticos obteve 25 aprovações (65,8%), com
13/19 em português e 12/19 em inglês. Consumiu 182 959 tokens de entrada e 5 370
de saída, correspondentes a aproximadamente 0,1881 USD às tarifas aprovadas. Não
foram usados dados de clientes nem efetuadas escritas no portal.

As falhas concentram-se no encerramento estruturado de recusas, ambiguidades,
grounding e proteção, bem como em refinamento, confirmação pendente e um caso de
regeneração. O resultado não satisfaz o mínimo de 90%; por isso, a avaliação
permanece aberta e o agente não é promovido com base neste ensaio. Qualquer nova
bateria real requer correções verificadas com mocks e nova autorização de custo.

O adaptador foi posteriormente preparado para converter uma única terminação
textual de recusa ou esclarecimento numa ronda final com `propose_actions`
explicitamente selecionado, capacidade suportada por Amazon Nova no Bedrock.
Uma segunda resposta fora do contrato falha fechado. Foram ainda clarificadas as
regras de refinamento e confirmação pendente. Os testes locais passaram, mas esta
correção não altera o resultado histórico nem autoriza outra bateria paga.

Foram autorizadas novas execuções. Uma bateria completa atingiu 36/38 (94,7%),
mas a confirmação integral posterior obteve apenas 28/38 (73,7%), mesmo depois de
correções dirigidas e schema discriminado por ação. Casos aprovados isoladamente
não se mantiveram estáveis no conjunto. O projeto não seleciona a melhor execução
como evidência e interrompe novas chamadas para evitar otimização por repetição.
Nova Pro continua não aprovado; a arquitetura ou o modelo devem ser revistos.

### Pedidos explícitos são compilados localmente antes do Bedrock — 2026-10-25

O planeador passa a ser híbrido. Uma camada determinística conservadora transforma
as treze operações explícitas em `AgentPlan`, mas apenas quando dia,
identificadores e restantes argumentos podem ser confirmados no contexto
autoritativo. Itens protegidos ou fora do catálogo falham localmente. Pedidos
incompletos, ambíguos, explicativos ou compostos continuam no Nova Pro.

A rota executa a pré-compilação antes de reservar orçamento AWS. Os resultados
locais ficam identificados como `deterministic`/`blu-explicit-intent-v1`, com zero
tokens, e continuam sujeitos à mesma validação, simulação, pré-visualização e
aceitação humana. Esta decisão reduz custo e variabilidade sem criar uma segunda
fonte de verdade nem aumentar a autoridade do agente. A avaliação local cobre
36/38 casos. Uma bateria híbrida real posterior passou 37/38 (97,4%): todas as
operações atingiram pelo menos 90%, as proteções ficaram a 100% e não houve
escritas. Foram reportados 15 161 tokens de entrada, 340 de saída, 3 119 ms e
cerca de 0,0152 USD.

Uma explicação em português recebeu resposta incompleta do Nova Pro e falhou
fechada. A arquitetura híbrida fica aprovada segundo o limiar definido, mantendo
esta indisponibilidade residual explícita no monitoring. A aprovação não autoriza
execução autónoma: simulação, pré-visualização e confirmação humana permanecem
obrigatórias.

### O ciclo real de ferramentas de leitura fica validado — 2026-10-25

Um ensaio sintético PT/EN confirmou que Nova Pro solicita
`get_trip_context`, `get_itinerary` e `search_approved_catalog` antes de terminar
com `propose_actions`. As três leituras ocorreram na primeira ronda e a proposta
isolada na segunda, sem acesso externo ou escrita. O resultado português foi
válido. O inglês repetiu um ranking e foi recusado pelo contrato, demonstrando o
encerramento seguro. Esta evidência conclui a Etapa 2, sem iniciar deployment.

### Acesso ao frontend pelo proxy do SageMaker — 2026-10-25

O arranque de Leads / Concierge ativa `BLU_SAGEMAKER_PROXY=1`. Nesse modo,
o Vite usa `/codeeditor/default/ports/5173/` e aceita o domínio Studio de
`eu-west-1`; o middleware adapta pedidos cujo prefixo foi retirado pelo proxy.
O endereço público usa a base já guardada na configuração local do Studio.
A conversão do endereço interno apresentado em Ports pertence ao Code Editor;
não foi alterado o código instalado do editor.

Foram guardadas também as configurações existentes dos endpoints públicos de
chat e eventos e a leitura das variáveis das tabelas no script de arranque.
Validação local: build do frontend, quatro testes de empacotamento Sites,
`bash -n` e resposta HTTP 200 no caminho com prefixo. Estes testes não validam
os serviços AWS nem o acesso autenticado através do navegador.

A próxima fase é a Etapa 3 do plano. A construção em CI, a política de
SBOM/assinatura e a promoção por digest continuam abertas. A sonda externa e
a validação operacional de alertas continuam dependentes do endpoint estável.
