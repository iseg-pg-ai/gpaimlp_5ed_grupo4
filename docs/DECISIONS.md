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

### O agente usa a API atual de LangChain — 2026-10-23

A fábrica usa `langchain.agents.create_agent`, ferramentas de domínio e o modelo
Bedrock configurado. LangChain/LangGraph pertencem ao grupo Python opcional
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
fonte CJK configurada para PDF.

### TXT/Canva deriva de uma versão guardada — 2026-10-19

A exportação TXT usa o snapshot selecionado e exclui contactos, referências de
reserva e notas internas. Não altera o estado dos PDFs DMC. O Canva produz uma
entrega independente sujeita à revisão do curador; atualizar o TXT não atualiza a
instalação do plugin nem substitui automaticamente um PDF publicado.

O pacote-fonte Canva 0.4.1 aceita os contratos TXT 1.1.0 e 1.0.0. A versão
instalada deve ser confirmada no anfitrião antes de importar outro ZIP; uma
atualização conserva o pacote anterior para rollback e só é aceite depois de uma
proposta de teste completa. Rever o repositório não atualiza a instalação remota.

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

Notificações externas e uma sonda fora da máquina continuam abertas no
[plano](../PLAN.md); logs e sondas locais não constituem monitoring de produção.

## Configuração e dependências

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
