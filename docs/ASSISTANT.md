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
O ranking ordena até cinco candidatos já elegíveis por dia e não altera o
roteiro. A escolha humana prepara uma proposta de adição, volta a passar pela
simulação e só cria uma versão depois de nova aceitação explícita. Os controlos
manuais de adicionar/remover usam /api/itinerary/edit, sem invocar o modelo.

O campo opcional `delivery` prepara PDF, Prompt TXT ou partilha num dos seis
idiomas suportados. Não pode ser combinado com alterações, alternativas ou
ranking: primeiro guarda-se a versão, depois prepara-se a entrega. O backend
recalcula o diagnóstico e bloqueia o botão quando existem impedimentos. Um clique
explícito cria o ficheiro; para partilha, abre apenas o modal existente. Email,
consentimento e prazo nunca entram no plano do modelo. Contactos escritos no chat
são removidos antes de o pedido ou a memória chegarem ao fornecedor.

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

O histórico de versões permite identificar uma versão efetivamente realizada e
recolher feedback para todos os cartões. A entrega é imutável e fica na mesma base
operacional das versões. Comentários e notas permanecem internos. O agente só pode
consultar agregados numéricos, etiquetas de problema e tendências de 30, 90 e 180
dias. Um caso histórico exige todas as atividades realizadas, avaliação global
mínima de quatro, ausência de incidentes e aprovação humana. O índice exclui nome,
contactos, comentários, PDFs e versões no Lixo. Estes sinais podem explicar ou
despriorizar uma sugestão, mas nunca alteram o catálogo nem demonstram
disponibilidade atual.

Uma edição e um bloqueio são estados distintos. O portal regista se a última
alteração de cada dia ou atividade veio do utilizador ou do assistente, mas essa
origem nunca ativa `isLocked`. Só a proteção explícita do curador e uma confirmação
concluída impedem novas alterações. Uma regeneração ampla preserva atividades
editadas manualmente; uma ação explícita e revista pelo curador pode voltar a
alterá-las. O mesmo dia pode ser editado repetidamente pelo Blu.

## Implementação atual e aceitação

A iteração atual substituiu os dois percursos Python por um único planeador
transacional híbrido. Um compilador local trata comandos inequívocos e o Amazon
Bedrock com Nova Pro interpreta apenas pedidos ambíguos, explicações,
recomendações e refinamentos compostos. Nenhum dos percursos recebe autoridade
adicional nem escreve diretamente no portal.

O contrato contém agora treze ações: as onze operações de itinerário anteriores,
`update_brief` e `update_pending_confirmation`. Não acrescenta acesso à
máquina, execução de código, browser autónomo, reservas, contactos a terceiros,
IAM, backups ou deployment. As ferramentas de leitura e escrita supervisionada
usam sempre o contexto da viagem. A identidade servidor e o isolamento
multiutilizador só ficam ativos quando o backend valida o principal ALB/Cognito;
no SageMaker continuam desativados de forma explícita.

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

O conjunto de avaliação tem pelo menos um caso válido e um caso de recusa por
ação, em português e inglês, além de pedidos compostos, ambíguos, adversariais,
versões obsoletas, atividades protegidas e indisponibilidade do fornecedor. Cada
operação precisa de pelo menos 90% de propostas semanticamente corretas, 100% de
respeito pelas proteções e 0 escritas sem confirmação. Falhar um critério de
segurança bloqueia a ativação, mesmo que a média global seja superior.

Chamadas reais permanecem opt-in, com orçamento e modelo aprovados. Os testes de
CI usam adaptadores simulados e não dependem de credenciais externas.

### Avaliação real de 25 de outubro de 2026

Uma execução explicitamente autorizada avaliou os 38 casos sintéticos com
`eu.amazon.nova-pro-v1:0`. Passaram 25 casos (65,8%): 13/19 em português e 12/19
em inglês. Foram contabilizados 182 959 tokens de entrada, 5 370 de saída e
53 584 ms de latência acumulada reportada. Às tarifas aprovadas, o custo calculado
foi 0,1881 USD.

Falharam sobretudo os casos em que o modelo deveria terminar uma recusa ou pedido
de esclarecimento através de `propose_actions`, além de refinamento de uma
proposta, `regenerate_day` em inglês e preparação de confirmação pendente. Três
falhas foram divergências semânticas com resposta estruturalmente válida; as
restantes foram normalizadas como `AGENT_INVALID_RESPONSE`. O ensaio não escreveu
no portal nem usou dados reais de clientes. Como o resultado ficou abaixo do
limiar de 90%, o modelo não é considerado aprovado para ativação autónoma e uma
nova execução paga exige correção local e nova autorização explícita.

Após o ensaio, o adaptador passou a recuperar uma única resposta textual de
recusa ou esclarecimento: mantém o texto dentro da conversa com o fornecedor e
faz uma ronda final com `propose_actions` selecionado explicitamente. Se essa
ronda não devolver uma única ferramenta válida, o pedido continua a falhar
fechado. A seleção específica é suportada pelos modelos Amazon Nova segundo a
[referência `ToolChoice` do Bedrock](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html).
As instruções também distinguem a preparação de confirmação pendente de um mero
reagendamento e explicitam que alternativas pedidas num refinamento não são
ações aplicadas. A correção passou nos 159 testes Python locais; comprovar a
melhoria semântica continua a exigir uma nova execução real autorizada.

As execuções seguintes demonstraram variabilidade incompatível com aprovação. A
segunda bateria completa atingiu 36/38 (94,7%), mas uma bateria integral posterior,
já com schema discriminado e correções dirigidas validadas, obteve 28/38 (73,7%).
Casos que passaram isoladamente voltaram a falhar na execução completa. Por isso,
o melhor resultado não é usado seletivamente como prova de qualidade e Nova Pro
permanece não aprovado para ativação autónoma. A próxima decisão deve comparar
outro modelo compatível, reduzir a liberdade do planeamento ou deslocar intenções
inequívocas para uma camada determinística antes de realizar novos ensaios pagos.

Essa camada determinística foi implementada como
`src/blu_ai/deterministic.py`. Reconhece apenas frases completas com argumentos
inequívocos, resolve identificadores contra o snapshot e candidatos autorizados,
recusa localmente itens protegidos ou exteriores ao catálogo e devolve o mesmo
`AgentPlan` sujeito a simulação e confirmação humana. Não usa correspondência
aproximada nem tenta adivinhar argumentos em falta. Quando não reconhece o pedido,
devolve controlo ao Nova Pro.

Nos 38 casos sintéticos atuais, 36 são agora concluídos localmente e todos passam
o respetivo oráculo sem chamadas AWS. Apenas duas explicações livres permanecem
no Nova Pro. A rota tenta `agent-compile`
antes de reservar orçamento; resultados locais usam o fornecedor
`deterministic`, modelo `blu-explicit-intent-v1`, zero tokens e custo zero. Apenas
um resultado nulo ativa a política de orçamento e `agent-plan`.

### Avaliação híbrida final de 25 de outubro de 2026

O primeiro ensaio híbrido obteve 34/38 (89,5%) e expôs três encerramentos
incompletos e um refinamento indevido no Nova Pro. Depois de mover esses contratos
inequívocos para o compilador e os validar localmente, uma bateria integral
independente obteve 37/38 (97,4%). Todas as treze operações ficaram a 100%; o
grupo `none`, que agrega recusas e leituras, ficou em 9/10 (90%). Português obteve
18/19 e inglês 19/19. Proteções mantiveram 100% e não houve escritas.

Só as duas explicações livres consultaram o Nova Pro. O ensaio contabilizou
15 161 tokens de entrada, 340 de saída e 3 119 ms de latência acumulada, com custo
estimado de 0,0152 USD às tarifas aprovadas. A explicação em português falhou
fechada porque a resposta estruturada omitiu campos obrigatórios: o portal não
recebeu plano nem alteração. O fluxo híbrido atinge o limiar aprovado, mas essa
falha continua a ser uma limitação de disponibilidade observável, não um sucesso.

Uma validação real separada confirmou o ciclo de leitura nos dois idiomas. Nova
Pro pediu `get_trip_context`, `get_itinerary` e `search_approved_catalog` em
paralelo na primeira ronda e terminou isoladamente com `propose_actions` na
segunda. Em português produziu um ranking válido. Em inglês repetiu o grupo do
mesmo dia; o contrato detetou `Ranking repetido`, devolveu
`AGENT_INVALID_RESPONSE` e não criou proposta nem alteração. Assim, a integração
das ferramentas fica validada sem converter variabilidade do modelo em sucesso.

Em cloud, o backend recusa a chamada antes do fornecedor quando faltam o teto
mensal ou o preço do modelo. A reserva usa uma estimativa conservadora do pedido e
do limite máximo de saída; o consumo confirmado vem dos tokens registados na
auditoria. Atingir o teto devolve erro controlado, não muda a viagem e não troca de
modelo. Os preços são configuração operacional por milhão de tokens e precisam de
ser revistos na fonte oficial antes de cada ativação ou mudança de modelo.

## Autoridade, persistência e falhas

O esquema partilhado está em `src/blu_ai/schemas/action-plan.json`. O compilador
e o fornecedor validam o mesmo contrato. Quando necessário, o planeador Python
usa Bedrock Converse num ciclo máximo de seis rondas e oito chamadas. Pode
ler o briefing minimizado, um dia do itinerário, os candidatos previamente
considerados elegíveis para esse dia, sinais agregados de qualidade, até cinco
casos semelhantes aprovados, meteorologia já consultada pelo portal e percursos
já guardados no itinerário. Todas as leituras usam o snapshot e o contexto que a
rota já recuperou e validou; não consultam outra base, não fazem pedidos externos
e não aceitam identificadores livres.

`get_weather_observation` só devolve resultados ainda válidos da cache do
servidor, usando a data, o local e as coordenadas do snapshot autoritativo. A
evidência distingue previsão de referência histórica; ausência de observação
significa apenas que não existem dados disponíveis para o agente.
`get_route_observations` lê os troços persistidos em `transitToNext` e distingue
um percurso medido pelo OSRM de uma estimativa. Nem uma referência histórica nem
uma estimativa provam condições atuais, disponibilidade ou viabilidade.
`get_supervision_signals` expõe apenas códigos, proveniência, dia e identificadores
de catálogo. Abrange chuva, encerramentos conhecidos, atrasos, cancelamentos ou
mudanças de horário comunicados pelo utilizador e indícios conservadores de campos
em falta, datas antigas, duplicados e mistura linguística. `observed`,
`historical_reference`, `user_reported` e `review_required` não são equivalentes:
os três últimos exigem confirmação ou revisão antes de qualquer ação.
O contexto da viagem inclui ainda diagnósticos determinísticos de capacidade,
horários, sobreposições, confirmações, catálogo, preços, moedas e orçamento.
Também sinaliza idades em falta, logística de chegada ou partida incompleta,
interesses contraditos por exclusões e restrições de mobilidade ou alimentação
demasiado vagas. Custos desconhecidos impedem uma conclusão positiva sobre a
adequação do orçamento. Estes diagnósticos pedem esclarecimento e nunca preenchem
respostas automaticamente.
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
O Monitoring lê esta auditoria em modo só de leitura e apresenta propostas,
aceitações, rejeições, pendentes, expirações, tokens e latência média. Os conflitos
das últimas 24 horas vêm dos eventos técnicos do endpoint do assistente. O custo
só é calculado quando `BLU_AGENT_RATES_JSON` contém tarifas válidas para todos
os modelos registados; configuração ausente ou incompleta é mostrada como tal e
nunca convertida num valor estimado. O agregado não lê prompts, planos, respostas
ou dados de clientes.
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

A superfície aprovada está tipada em `agent-tool-registry.ts`: leitura de viagem,
catálogo, meteorologia em cache e percursos persistidos, proposta, aceitação,
rejeição e seleção de alternativa. A preparação
de entrega continua dentro da proposta; reutiliza os endpoints manuais existentes
e não acrescenta uma ferramenta de envio. Leituras não
exigem confirmação, propostas produzem sempre pré-visualização e todas as
escritas exigem uma decisão explícita. Ferramentas administrativas, destrutivas,
de infraestrutura, reservas ou contactos externos não fazem parte do registo e
continuam negadas por omissão.

## Execução privada

Reutiliza o arranque do portal no SageMaker Studio Code Editor e as credenciais
IAM do ambiente. Não requer novas dependências, uma nova base de dados ou Lambda.
O endpoint principal é POST /api/assistant/plan; /api/assistant delega no mesmo
fluxo. `/api/assistant/feedback` gere a conclusão, o questionário e a aprovação
do caso. Em cloud, feedback exige edição da viagem e a aprovação exige edição do
catálogo; no modo local desativado ficam registados atores locais explícitos.
Estes endpoints dependem do acesso privado do SageMaker e verificam a
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

Em 25 de outubro de 2026 foram aprovados Amazon Bedrock, o perfil
`eu.amazon.nova-pro-v1:0`, Standard On-Demand em EU (Ireland), 0,92 USD por
milhão de tokens de entrada, 3,68 USD por milhão de tokens de saída e um teto de
10 USD por mês. Mantêm-se 1800 tokens máximos de saída, timeout de 35 segundos e
até duas chamadas por pedido. Os preços devem ser revistos na tabela oficial da
AWS antes de cada deployment ou alteração de modelo.

O portal chama o planeador Python por processo local, sem shell nem serviço HTTP
adicional. A antiga fachada FastAPI e o agente LangGraph foram removidos para
manter um único contrato e um único ponto de entrada. Não configurar segredos no
Git.

## Exportação e validação

PDF e TXT continuam a usar os snapshots e o histórico existentes. O TXT preserva
o formato atual do Prompt TXT, com indicação do idioma escolhido;
não foi transformado numa tradução integral do ficheiro.

Testes locais usam mocks do fornecedor e viagens temporárias, sem chamadas pagas.
Executar npm run check e npm run build no portal e unittest discover em tests
com PYTHONPATH=src no ambiente Python preparado. Os testes adicionais são
tests/assistant-actions.test.mjs, tests/feedback-store.test.mjs,
tests/historical-cases.test.mjs, tests/feedback-route.test.mjs, tests/assistant-api.mjs e
tests/browser/assistant.mjs no portal. Os scripts HTTP/navegador exigem um servidor
local de testes e os seus parâmetros; consultar o cabeçalho de cada script.
scripts/evaluate_agent.py --list lista casos sintéticos sem chamar o modelo;
a execução real exige --live e aprovação da fase aplicável.

Os mocks demonstram o funcionamento técnico e as proteções, não a qualidade
semântica de Nova Pro. Uma avaliação real deverá validar acesso privado e modelo,
com pelo menos 90% por operação e por idioma de conversa, e testar PDF/TXT em
PT, EN, ES, FR, DE e ZH. Não declarar esses critérios cumpridos nesta fase.
