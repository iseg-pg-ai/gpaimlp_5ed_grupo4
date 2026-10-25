# Assistente BLU — itinerário transacional

## Âmbito atual

O modelo consulta ferramentas de leitura limitadas, propõe alterações e o portal
valida-as com as regras já existentes.
O fluxo é pedido → proposta → validação → pré-visualização → aceitação explícita
→ versão. Escrever «ok» no chat não aplica alterações. Rejeitar não cria versões.
Cada proposta refere uma viagem e uma versão guardada. Rascunhos por guardar,
versões ultrapassadas ou no Lixo exigem resolução antes de continuar.

Operações: add_catalog_item, replace_item, remove_item, reschedule_item,
reorder_day, set_day_capacity, add_free_period, set_free_day, move_item,
optimize_route, regenerate_day, update_brief e update_pending_confirmation. Até
oito ações por proposta, sem campos extra ou ações duplicadas. Opções de
substituição exigem uma escolha e nova revisão.
Não há ranking nem seleção automática de uma opção de adição. Os controlos
manuais de adicionar/remover usam /api/itinerary/edit, sem invocar o modelo.

Pedidos e esclarecimentos em português ou inglês. No modo cloud, a memória
servidor fica ligada ao principal validado do ALB/Cognito. Usa um store privado na
mesma SQLite operacional, isolado por utilizador, viagem e versão, com oito turnos
recentes, resumo limitado, eliminação explícita, retenção de 30 dias e legal hold.
No SageMaker, sem um principal autenticado, o portal mantém o contexto recente do
navegador e não o trata como identidade. Um identificador fornecido pelo browser
nunca é autoridade. O catálogo e a estrutura do itinerário são dados, nunca instruções.
Nomes de clientes, contactos e notas internas não fazem parte do contexto
estruturado enviado ao modelo.

O agente pode propor alterações a oito campos permitidos do briefing e preparar
horário, local, preço ou fornecedor de uma confirmação ainda pendente. Não pode
alterar dados pessoais, contactos, referências, notas, catálogo, reservas ou o
estado confirmado.
Atividades protegidas ou confirmadas são preservadas, inclusive contra efeitos
indiretos. Ao mudar horários ou dias, dados de confirmação pendente permanecem
intactos e o portal avisa que exigem revisão manual. A sequência geográfica é
uma estimativa; não demonstra tempos reais ou disponibilidade.

Uma edição e um bloqueio são estados distintos. O portal regista se a última
alteração de cada dia ou atividade veio do utilizador ou do assistente, mas essa
origem nunca ativa `isLocked`. Só a proteção explícita do curador e uma confirmação
concluída impedem novas alterações. Uma regeneração ampla preserva atividades
editadas manualmente; uma ação explícita e revista pelo curador pode voltar a
alterá-las. O mesmo dia pode ser editado repetidamente pelo Blu.

## Próxima iteração: âmbito e aceitação

A iteração atual substituiu os dois percursos Python por um único planeador
transacional baseado no Amazon Bedrock com Nova Pro. O fornecedor não recebe
autoridade adicional nem escreve diretamente no portal.

O contrato contém agora treze ações: as onze operações de itinerário anteriores,
`update_brief` e `update_pending_confirmation`. Não acrescenta acesso à
máquina, execução de código, browser autónomo, reservas, contactos a terceiros,
IAM, backups ou deployment. As ferramentas de leitura e escrita supervisionada
só entram depois de identidade e sessões servidor estarem ligadas ao portal.

### Critérios obrigatórios

Uma implementação só conclui esta iteração quando:

1. existe um único ponto de entrada para contexto, fornecedor e contrato;
2. Nova Pro devolve um `AgentPlan` validado pelo contrato partilhado;
3. fornecedor, modelo, timeout e limite de saída são configuração servidor;
4. ausência de credenciais ou fornecedor indisponível não altera a viagem;
5. contexto inclui chegada, partida, voos e ocasião especial, mas exclui nome,
   email, contactos, notas internas e referências de reserva;
6. cada proposta mantém viagem, versão-base e utilizador autenticado;
7. o agente só lê ou propõe dentro das permissões do utilizador;
8. qualquer escrita continua a exigir pré-visualização e aceitação explícita;
9. conflitos, dupla aceitação e versões obsoletas continuam recusados;
10. logs guardam métricas e hashes, nunca prompts, respostas ou dados de cliente;
11. testes simulados cobrem o fornecedor, falhas, injeção e autorização;
12. uma avaliação real separada atinge o limiar aprovado antes da ativação.

### Conjunto mínimo de avaliação

O conjunto de avaliação terá pelo menos um caso válido e um caso de recusa por
ação, em português e inglês, além de pedidos compostos, ambíguos, adversariais,
versões obsoletas, atividades protegidas e indisponibilidade do fornecedor. Cada
operação precisa de pelo menos 90% de propostas semanticamente corretas, 100% de
respeito pelas proteções e 0 escritas sem confirmação. Falhar um critério de
segurança bloqueia a ativação, mesmo que a média global seja superior.

Chamadas reais permanecem opt-in, com orçamento e modelo aprovados. Os testes de
CI usam adaptadores simulados e não dependem de credenciais externas.

Em cloud, o backend recusa a chamada antes do fornecedor quando faltam o teto
mensal ou o preço do modelo. A reserva usa uma estimativa conservadora do pedido e
do limite máximo de saída; o consumo confirmado vem dos tokens registados na
auditoria. Atingir o teto devolve erro controlado, não muda a viagem e não troca de
modelo. Os preços são configuração operacional por milhão de tokens e precisam de
ser revistos na fonte oficial antes de cada ativação ou mudança de modelo.

## Autoridade, persistência e falhas

O esquema partilhado está em `src/blu_ai/schemas/action-plan.json`. O planeador
Python usa Bedrock Converse num ciclo máximo de seis rondas e oito chamadas. Pode
ler o briefing minimizado, um dia do itinerário e os candidatos previamente
considerados elegíveis para esse dia. Todas as leituras usam o snapshot que a rota
já recuperou e validou; não consultam outra base nem aceitam identificadores livres.
O contexto da viagem inclui ainda diagnósticos determinísticos de capacidade,
horários, sobreposições, confirmações, catálogo, preços, moedas e orçamento.
`propose_actions` termina o ciclo e não escreve. A autoridade de
elegibilidade, horários, capacidade e proteções permanece no TypeScript.
Se essa primeira simulação falhar, o portal converte a causa num código limitado
e numa instrução genérica, sem devolver ao fornecedor a mensagem bruta ou dados
do itinerário. O modelo pode corrigir o plano completo uma única vez. A política
de custo reserva antecipadamente as duas chamadas possíveis; uma segunda falha
termina o pedido sem escrita e sem outro ciclo.
O servidor volta a simular ao aceitar e compara o resultado com a pré-visualização.
Mudanças de versão, catálogo ou regras que afetem o resultado invalidam a proposta.
As propostas expiram após 30 minutos. A aceitação cria a versão e atualiza a
auditoria na mesma transação SQLite, incluindo a proteção contra duplo clique.
As marcas de origem acompanham o snapshot, pelo que sobrevivem ao refresh, ao
reinício e às exportações baseadas nessa versão.

A tabela `agent_runs` partilha a base materializada em `BLU_EXPORT_DIR`. Guarda
hash do pedido, ações/resumo/avisos, estado, versão base/final, modelo, tokens e
latência. Não guarda o texto integral do pedido nem o histórico da conversa.
Os diagnósticos registam códigos de erro, sem prompts ou exceções do fornecedor.
Não há troca automática de modelo: erros de acesso, disponibilidade, tempo ou
contrato são explícitos e deixam a viagem intacta.

As tabelas `agent_conversations` e `agent_conversation_turns` usam a mesma base,
mas têm finalidade distinta da auditoria: conservam memória temporária e podem
conter texto da conversa. Não são logs. A política central elimina sessões
expiradas e respetivos turnos, salvo preservação legal; versões autoritativas e
exports não são eliminados por esta limpeza.

No modo `alb-cognito`, o backend valida tanto `x-amzn-oidc-data`, assinado pelo
ALB, como o access token Cognito, confirma o mesmo `sub`, o ARN do ALB, issuer e
client ID e deriva o papel apenas de grupos conhecidos. Headers legacy não
assinados nunca bastam. Esta implementação segue a
[verificação de claims documentada pela AWS](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html#user-claims-encoding).
`agent.propose` é obrigatório para pedir uma proposta e `agent.approve` para
aceitar, rejeitar ou selecionar alternativas. O `ownerId` fica na auditoria e
impede decisões por outro utilizador.

A superfície aprovada está tipada em `agent-tool-registry.ts`: leitura de viagem
e catálogo, proposta, aceitação, rejeição e seleção de alternativa. Leituras não
exigem confirmação, propostas produzem sempre pré-visualização e todas as
escritas exigem uma decisão explícita. Ferramentas administrativas, destrutivas,
de infraestrutura, reservas ou contactos externos não fazem parte do registo e
continuam negadas por omissão.

## Execução privada

Reutiliza o arranque do portal no SageMaker Studio Code Editor e as credenciais
IAM do ambiente. Não requer novas dependências, uma nova base de dados ou Lambda.
O endpoint principal é POST /api/assistant/plan; /api/assistant delega no mesmo
fluxo. Estes endpoints dependem do acesso privado do SageMaker e verificam a
origem quando enviada. Não publicar o portal diretamente na Internet.

Configuração do planeador:

| Variável | Utilização |
| --- | --- |
| BLU_PYTHON | Python do ambiente com o grupo agent instalado |
| BLU_AGENT_PROVIDER | apenas `bedrock` |
| BEDROCK_MODEL_ID | Modelo Bedrock configurável; predefinido eu.amazon.nova-pro-v1:0 |
| AWS_REGION | Região Bedrock; alternativa AWS_DEFAULT_REGION, depois eu-west-1 |
| BLU_AGENT_MAX_OUTPUT_TOKENS | Limite de saída, 1800 por defeito; 256 a 4096 |
| BLU_AGENT_TIMEOUT_SECONDS | Timeout do fornecedor, 35 por defeito; 5 a 120 |
| BLU_AGENT_MONTHLY_BUDGET_USD | Teto mensal obrigatório no modo cloud |
| BLU_AGENT_RATES_JSON | Preços atuais por milhão de tokens de entrada e saída |
| BLU_EXPORT_DIR | Armazenamento de versões e auditoria |
| PORTAL_PUBLIC_ORIGIN | Origem pública do proxy privado quando aplicável |

O serviço HTTP Python é apenas uma fachada opcional do mesmo planeador. A geração
autónoma antiga em `/api/agent/curate` devolve `410`; não existe um segundo agente
LangGraph com autoridade própria. Se a fachada for usada,
exige BLU_AGENT_API_TOKEN; BLU_AGENT_ALLOWED_ORIGINS aceita apenas origens
explícitas separadas por vírgulas, sem wildcard. /health é público no serviço.
Não configurar segredos no Git. O portal chama o planeador por processo local.

## Exportação e validação

PDF e TXT continuam a usar os snapshots e o histórico existentes. O TXT preserva
o formato atual do Prompt TXT, com indicação do idioma escolhido;
não foi transformado numa tradução integral do ficheiro.

Testes locais usam mocks do fornecedor e viagens temporárias, sem chamadas pagas.
Executar npm run check e npm run build no portal e unittest discover em tests
com PYTHONPATH=src no ambiente Python preparado. Os testes adicionais são
tests/assistant-actions.test.mjs, tests/assistant-api.mjs e
tests/browser/assistant.mjs no portal. Os scripts HTTP/navegador exigem um servidor
local de testes e os seus parâmetros; consultar o cabeçalho de cada script.
scripts/evaluate_agent.py --list lista casos sintéticos sem chamar o modelo;
a execução real exige --live e aprovação da fase aplicável.

Os mocks demonstram o funcionamento técnico e as proteções, não a qualidade
semântica de Nova Pro. Uma avaliação real deverá validar acesso privado e modelo,
com pelo menos 90% por operação e por idioma de conversa, e testar PDF/TXT em
PT, EN, ES, FR, DE e ZH. Não declarar esses critérios cumpridos nesta fase.
