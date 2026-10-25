# Assistente BLU — itinerário transacional

## Âmbito atual

O modelo propõe alterações; o portal valida-as com as regras já existentes.
O fluxo é pedido → proposta → validação → pré-visualização → aceitação explícita
→ versão. Escrever «ok» no chat não aplica alterações. Rejeitar não cria versões.
Cada proposta refere uma viagem e uma versão guardada. Rascunhos por guardar,
versões ultrapassadas ou no Lixo exigem resolução antes de continuar.

Operações: add_catalog_item, replace_item, remove_item, reschedule_item,
reorder_day, set_day_capacity, add_free_period, set_free_day, move_item,
optimize_route e regenerate_day. Até oito ações por proposta, sem campos extra
ou ações duplicadas. Opções de substituição exigem uma escolha e nova revisão.
Não há ranking nem seleção automática de uma opção de adição. Os controlos
manuais de adicionar/remover usam /api/itinerary/edit, sem invocar o modelo.

Pedidos e esclarecimentos em português ou inglês. O fluxo SageMaker atual ainda
envia apenas o contexto recente guardado no navegador. A memória servidor já tem
um store privado na mesma SQLite operacional, isolado por utilizador, viagem e
versão, com oito turnos recentes, resumo limitado, eliminação explícita, retenção
de 30 dias e legal hold. Esse store permanece desligado do endpoint até existir
um principal autenticado no backend; um identificador fornecido pelo browser não
é autoridade. O catálogo e a estrutura do itinerário são dados, nunca instruções.
Nomes de clientes, contactos e notas internas não fazem parte do contexto
estruturado enviado ao modelo.

O agente não altera briefing, catálogo, preços, confirmações nem reservas.
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
transacional. Bedrock e OpenAI são adaptadores do mesmo contrato; nenhum
fornecedor recebe autoridade adicional nem escreve diretamente no portal. A
integração OpenAI seguirá function calling com schema estrito, mantendo validação
dos argumentos no backend, como recomendado na
[documentação oficial OpenAI](https://developers.openai.com/api/docs/guides/function-calling).

O primeiro incremento conserva as onze ações atuais. Não acrescenta acesso à
máquina, execução de código, browser autónomo, reservas, contactos a terceiros,
IAM, backups ou deployment. As ferramentas de leitura e escrita supervisionada
só entram depois de identidade e sessões servidor estarem ligadas ao portal.

### Critérios obrigatórios

Uma implementação só conclui esta iteração quando:

1. existe um único ponto de entrada para contexto, fornecedor e contrato;
2. Bedrock e OpenAI devolvem exatamente o mesmo `AgentPlan` validado;
3. fornecedor, modelo, timeout e limite de saída são configuração servidor;
4. ausência de credenciais ou fornecedor indisponível não altera a viagem;
5. contexto inclui chegada, partida, voos e ocasião especial, mas exclui nome,
   email, contactos, notas internas e referências de reserva;
6. cada proposta mantém viagem, versão-base e utilizador autenticado;
7. o agente só lê ou propõe dentro das permissões do utilizador;
8. qualquer escrita continua a exigir pré-visualização e aceitação explícita;
9. conflitos, dupla aceitação e versões obsoletas continuam recusados;
10. logs guardam métricas e hashes, nunca prompts, respostas ou dados de cliente;
11. testes simulados cobrem ambos os fornecedores, falhas, injeção e autorização;
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

## Autoridade, persistência e falhas

O esquema partilhado está em `src/blu_ai/schemas/action-plan.json`. O planeador
Python usa Bedrock Converse, sem ferramentas de escrita. A autoridade de
elegibilidade, horários, capacidade e proteções permanece no TypeScript.
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
| BLU_AGENT_PROVIDER | `bedrock` por defeito ou `openai`; nunca há fallback automático |
| BEDROCK_MODEL_ID | Modelo Bedrock configurável; predefinido eu.amazon.nova-pro-v1:0 |
| OPENAI_MODEL | Modelo obrigatório quando o fornecedor é `openai` |
| OPENAI_API_KEY | Segredo obrigatório no servidor quando o fornecedor é `openai` |
| AWS_REGION | Região Bedrock; alternativa AWS_DEFAULT_REGION, depois eu-west-1 |
| BLU_AGENT_MAX_OUTPUT_TOKENS | Limite de saída, 1800 por defeito; 256 a 4096 |
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
