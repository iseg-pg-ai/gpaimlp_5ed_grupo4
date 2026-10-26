# Decisões técnicas vigentes

Revisto em 25 de outubro de 2026. Este documento conserva escolhas que condicionam
arquitetura, dados e autoridade do sistema. Código, testes e manifests prevalecem.
Procedimentos pertencem aos guias especializados; pendências ao [plano](../PLAN.md).
Decisões substituídas e relatos de execução ficam no histórico Git.

## Dados e persistência

### S3 conserva as releases; ETL e estado operacional são independentes — 2026-10-23

Fontes, warehouse e estado operacional têm releases separadas no S3. A máquina
materializa uma cache reconstruível; uma reconstrução do warehouse não pode
substituir catálogo, versões, partilhas ou PDFs. Excel, PDF e suplementos são
protegidos; alterações editoriais não modificam fontes brutas.

A publicação valida manifestos, tamanhos e hashes antes de mudar o apontador ativo.
Backups conservam checkpoints imutáveis, separados das releases. A aplicação não
elimina objetos S3; inventariar versões substituídas não autoriza a sua eliminação.

Referência: [Dados e operações](DATA_PIPELINE.md).

### SQLite exige uma única instância escritora — 2026-10-24

Vários processos podem partilhar SQLite na mesma instância, com controlo de revisão
e recusa de escritas obsoletas. Este contrato não suporta várias réplicas escritoras.
Escala horizontal exige rever a persistência ou manter um único serviço escritor.

Operações usam chaves idempotentes. O write-ahead conserva a operação antes do commit
SQLite até existir outbox S3, permitindo recuperar a interrupção entre esses passos
sem duplicar revisões. Filas transitórias não constituem outra fonte de verdade.

Referência: [Arquitetura](ARCHITECTURE.md) e [testes](TESTING.md).

### Dados desconhecidos não são confirmações — 2026-10-12

Ausência de preço, horário, disponibilidade, acessibilidade ou compatibilidade
mantém-se explícita. Custos conhecidos, pendências e moedas são separados; conflitos
ou lacunas relevantes exigem revisão humana.

### Retenção conserva versões autoritativas — 2026-10-25

A política central em `config/retention_policy.json` rege a limpeza; preservação
legal impede eliminações. Versões autoritativas e bytes PDF não são removidos pela
limpeza automática e continuam sujeitos ao Lixo e ao ciclo de vida da versão.

Referência: [Operações](OPERATIONS.md).

## Curadoria e entregas

### A decisão final pertence ao curador — 2026-10-12

Catálogo aprovado e validações determinísticas prevalecem sobre o modelo. Propostas
exigem simulação, pré-visualização e aceitação humana. Regenerações preservam edições
manuais, atividades protegidas e confirmações; uma edição do agente não bloqueia o dia.

### Versões publicadas são imutáveis — 2026-10-12

Cada versão conserva snapshot, relação parental, revisão, hash e bytes PDF. Alterar
catálogo ou itinerário não modifica entregas anteriores. O Lixo retira versões da
vista ativa sem destruir imediatamente o snapshot; o restauro precede nova exportação.

### Partilhas exigem consentimento, expiram e são revogáveis — 2026-10-24

A partilha conserva versão, idioma, destinatário, consentimento e validade. Registos
incompletos, expirados ou revogados falham fechados. Enviar a versão para o Lixo
revoga as ligações na mesma transação; restaurar a versão não restaura acessos.
Clientes externos não recebem acesso ao workspace.

### Prompt TXT e tradução preservam a entrega original — 2026-10-24

Prompt TXT deriva da versão guardada, exclui contactos, referências de reserva e
notas internas e não altera o PDF DMC. É neutro quanto à ferramenta de destino;
um documento derivado continua sujeito a revisão humana.

A tradução opcional usa modelos locais e preserva números, preços, horários,
moedas e identificadores. Alterações não recuperáveis falham explicitamente.
Mandarim exige uma fonte CJK no PDF. Fotografias exigem autorização, licença e créditos.

Referência: [Portal](PORTAL.md).

### Percursos autoritativos pertencem à fronteira Python — 2026-10-24

O servidor delega em `portal.routing` o cálculo de troços, ordenação, realinhamento
horário e resumo diário. Estimativas de fallback são identificadas como estimativas.
O adaptador TypeScript não constitui outro motor autoritativo de roteamento.

## Agente de IA

### Um planeador transacional com treze ações — 2026-10-25

Portal e fachada privada reutilizam `AgentPlan`. A geração autónoma LangGraph foi
substituída por um fluxo com viagem, versão-base, proposta e aceitação explícita.
O agente pode propor alterações permitidas do briefing e itinerário e preparar
confirmações pendentes; não altera catálogo nem confirma reservas.

O modelo recebe contexto autoritativo minimizado e ferramentas de leitura/proposta,
sem acesso a SQL, S3, shell ou escrita direta. Contactos, notas internas e referências
de reserva são excluídos. Fontes, textos de clientes e respostas externas são dados,
nunca instruções.

Referência: [Âmbito](AGENT_SCOPE.md) e [assistente](ASSISTANT.md).

### Pedidos inequívocos são compilados antes do Bedrock — 2026-10-25

A arquitetura híbrida compila operações explícitas apenas quando os argumentos são
confirmados no contexto autoritativo. Pedidos ambíguos, incompletos, explicativos ou
compostos seguem para Nova Pro. Ambos os percursos usam as mesmas validações e
aceitação humana; a compilação local não consome tokens nem aumenta a autoridade.

A instabilidade do planeador apenas com Nova Pro motivou esta escolha. A avaliação
híbrida autorizada passou 37/38 casos, com 100% das proteções e sem escritas. Uma
resposta incompleta falhou fechada; esta limitação permanece no plano de monitoring.

### Identidade e ownership são validados no backend — 2026-10-25

O modo cloud valida claims assinadas pelo ALB e access token Cognito, incluindo
emissor, cliente, expiração e correspondência de `sub`. Um identificador enviado
pelo navegador não prova identidade. Apenas o principal autorizado pode decidir
sobre a sua proposta; a memória servidor fica isolada por utilizador, viagem e versão.

O modo SageMaker sem identidade autenticada não ativa memória autoritativa nem
simula multiutilizador. Capacidades administrativas e de infraestrutura ficam fora
das ferramentas do agente.

### Nova Pro é o fornecedor único, com orçamento limitado — 2026-10-25

Foi aprovado Bedrock com `eu.amazon.nova-pro-v1:0`, teto de 10 USD/mês, até 1800
tokens de saída, timeout de 35 segundos e até duas chamadas por pedido. Preços
operacionais e modelo devem ser revalidados antes de deployment ou mudança.

O backend reserva o custo máximo no modo cloud. Configuração incompleta, orçamento
esgotado ou falha do fornecedor terminam sem alteração e sem fallback silencioso.
Uma falha de simulação permite uma única correção com código sanitizado, sem devolver
texto bruto ao modelo. Testes usam mocks; chamadas reais exigem autorização aplicável.

Referência: [Assistente](ASSISTANT.md).

### Feedback, contexto externo e entregas mantêm supervisão humana — 2026-10-25

Feedback associa-se à versão realizada; memória histórica exige dados completos,
qualidade mínima e aprovação humana. O modelo recebe agregados e identificadores,
sem comentários livres, contactos ou PDFs. Precedentes não provam disponibilidade
atual nem alteram catálogo automaticamente.

Meteorologia e percursos são leituras de dados já consultados ou persistidos;
pedir uma proposta não desencadeia consultas externas. Sinais de perturbação ou de
qualidade são indícios para revisão, com proveniência, nunca confirmações.

O agente pode preparar uma exportação ou partilha, mas a versão é guardada primeiro
e a execução exige decisão explícita. Destinatário, consentimento e retenção ficam
no formulário manual; o modelo não cria ligações nem envia mensagens.

## Arquitetura cloud e segurança

### Curation Studio tem uma stack e um ciclo de entrega próprios — 2026-10-25

A arquitetura-alvo em `eu-west-1` usa uma única tarefa escritora ECS, EFS cifrado,
releases e backups S3, ALB com TLS, Cognito e Secrets Manager. A stack
`infra/curation-workspace.mjs` é independente do site público e WhatsApp para separar
ownership, dados e ciclos de deployment. Staging e produção são isolados.

Os papéis internos são `owner`, `admin`, `curator` e `viewer`; o backend aplica papel
e ownership. A arquitetura prevê rascunhos privados sincronizados por utilizador e
viagem. Objetivos aprovados: 99,5% de disponibilidade mensal, RPO de cinco minutos e
RTO de sessenta minutos; não constituem níveis já comprovados em produção.

O Grupo 4 assume provisoriamente operação e segurança na fase académica. Aprovar a
arquitetura autoriza preparação local, sem autorizar criação de recursos ou custos.

Referência: [Operações](OPERATIONS.md) e [plano](../PLAN.md).

### O Backoffice só confia em identidades explícitas — 2026-10-25

`BACKOFFICE_TRUSTED_PRINCIPAL_ARNS` limita a confiança do papel de análise a
identidades IAM da conta configurada. Raízes de conta, curingas e outras contas são
recusados; sem lista, o papel não é criado. Isto evita conceder confiança implícita
a papéis partilhados do ambiente académico.

Evidência local: síntese CDK em `infra/tests/backoffice.test.mjs`. Não comprova
atualização dos papéis já publicados; essa validação permanece no plano.

### Origem e limites reduzem a exposição das APIs — 2026-10-25

Os POST de versões, tradução, limpeza do Lixo e partilhas recusam uma origem
externa antes de processar o corpo; a revogação de partilhas usa o mesmo helper.
O planeador conserva a verificação de origem existente. A origem pública
configurada prevalece sobre a interna do proxy SageMaker. Pedidos sem `Origin`
continuam permitidos; este controlo não substitui identidade e permissões.

O stage da API pública limita o tráfego agregado a 10 pedidos/s, com pico de 20;
o chat tem limite de 2/s, com pico de 5. Estes limites não são um orçamento por
utilizador nem comprovam proteção integral contra abuso. A síntese local testa
os valores no template; a aplicação em serviços reais depende de deployment.

Evidência: `dmc-workspace/tests/infrastructure.test.mjs` e
`infra/tests/throttling.test.mjs`. Na validação local, passaram 31 testes de
infraestrutura, lint, tipos, formatação e build do portal com Node 22.13. A bateria
do portal passou 206 testes, com um ignorado, usando o warehouse preparado em
cache. O YAML ETL foi verificado localmente, preservando gate e retenção; a execução
GitHub Actions e a validação dos serviços reais permanecem pendentes.

### Dados de runtime ficam fora da descoberta automática do build — 2026-10-25

Caminhos operacionais e executáveis fornecidos pelo ambiente são excluídos do
tracing Turbopack nesses acessos. Os valores e o comportamento em runtime mantêm-se;
a imagem disponibiliza explicitamente o código Python e as políticas necessárias.
O contexto Docker admite apenas os diretórios da aplicação, excluindo dados,
runtimes, caches e configuração privada. A dependência local do portal é copiada
antes da instalação pelo lockfile.

Evidência local: build sem os sete avisos de tracing, verificação de 1410 caminhos
únicos dos manifests `.nft.json` sem referências aos diretórios privados verificados,
e check do portal com 206 testes aprovados e um ignorado. A construção da imagem
continua dependente do CI autorizado; não foi executada localmente.

### CI usa dados sintéticos e contratos versionados — 2026-10-24

CI não usa fontes comerciais. O gate de publicação verifica versão de schema,
integridade e validação do warehouse; exceções identificam campo, responsável,
justificação e validade. O ciclo de testes preserva os contratos entre catálogo,
ETL, versão e PDF, sem transformar lacunas em valores confirmados.

Referência: [Testes](TESTING.md).

### Curation Studio exige imagem ECR por digest — 2026-10-26

`BLU_CURATION_IMAGE_URI` passa a exigir `@sha256:` seguido de 64 caracteres
hexadecimais, na conta e região alvo. Tags são recusadas para impedir que uma
mesma referência de entrega passe a apontar para outros bytes. Os quatro
containers usam a mesma referência, registada no output `ImageUri`.

Evidência: síntese local em `infra/tests/curation-workspace.test.mjs`, incluindo
recusa de tags, hashes inválidos e conta/região diferentes. Não foi publicado
nenhum recurso. Publicação, verificação de assinatura e promoção permanecem
pendentes; o digest identifica conteúdo e não comprova aprovação operacional.

### Tradução usa PyTorch CPU e a cache de imagem é mínima — 2026-10-26

A tradução já executa CTranslate2 em CPU/int8. PyTorch passa a usar o índice
oficial CPU em Linux e Windows, com a mesma versão-base e sem as 19 dependências
GPU retiradas do lockfile. Mantém-se o override de segurança Stanza/Argos.
Os exports são gerados por `scripts/export_requirements.py` e incluem o índice
CPU para a instalação alternativa por pip. O build verifica a ausência de CUDA.

A cache Docker passa de `mode=max` para `mode=min`, reduzindo as camadas
intermédias exportadas à custa de possíveis reconstruções. Isto reduz a cache,
sem por si só reduzir a imagem final. O
[CI CPU](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40249243292)
passou, incluindo a verificação em Python 3.13: o job da imagem passou de
25 min 49 s para 3 min 51 s. O tamanho final ainda não foi medido.
Imports reais e cinco testes de tradução com mocks
passaram num ambiente temporário Python 3.12. Dois ensaios de inferência local
EN/PT com modelos existentes preservaram hora e montante, sem instalar modelos.
Em português, o modelo apresentou EUR como euros. Não foi validado PDF ou
comportamento de todos os idiomas.

## Monitoring e ambiente local

### Monitoring não aumenta a autoridade sobre dados — 2026-10-19

A aplicação local de Monitoring é independente e autentica os perfis no servidor;
alterações exigem CSRF e não podem remover o último administrador. Credenciais e
runtime ficam fora do Git. Esta identidade local não substitui Cognito em produção.

Limpeza automática limita-se a caches regeneráveis e backups do próprio Monitoring;
fontes, catálogo, warehouse, exports e credenciais ficam protegidos.

### Telemetria é privada e reutiliza a auditoria existente — 2026-10-25

Logs e métricas excluem tokens, prompts, respostas, contactos e dados de clientes.
A identidade de uma pessoa só é atribuída com validação no backend. As métricas do
agente leem a auditoria existente, sem criar outra persistência; edições posteriores
não são atribuídas causalmente ao agente. Sem tarifas configuradas, custos ficam
por configurar.

SNS é o transporte opcional de incidentes, com IAM limitado ao tópico, entrega
persistente, repetição e deduplicação. A integração foi validada, mas não substitui
uma sonda externa. As [pendências de monitoring](../PLAN.md#pendências-de-monitoring)
continuam abertas.

### O ambiente académico partilha a role, não o estado privado — 2026-10-24

Colegas podem usar `SageMakerTeachingExecutionRole`, mas mantêm workspace, clone,
configuração e cache próprios. Não se copiam credenciais, sessões ou dados privados.
Dados são recuperados de releases autorizadas. Esta exceção académica não define
a identidade de produção.

Referência: [Onboarding](ONBOARDING.md).

### Cada aplicação mantém a sua fronteira — 2026-10-18

O Observatório lê apenas o warehouse publicado; não chama o agente nem escreve no
catálogo. A apresentação é independente e usa exemplos ilustrativos, sem dados
operacionais. Estas entradas não são módulos obsoletos por ausência de imports.

Referência: [Arquitetura](ARCHITECTURE.md).
