# Assistente BLU — piloto de itinerário

## Âmbito da Fase 2

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

Pedidos e esclarecimentos em português ou inglês. A conversa e a preferência
de idioma ficam no navegador, por viagem. O servidor recebe apenas o contexto
recente necessário. O catálogo e a estrutura do itinerário são dados, nunca
instruções. Nomes de clientes, contactos e notas internas não fazem parte do
contexto estruturado enviado pelo portal ao modelo.

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

## Autoridade, persistência e falhas

O esquema partilhado está em src/blu_ai/schemas/action-plan.json. O planeador
Python usa Bedrock Converse, sem ferramentas de escrita. A autoridade de
elegibilidade, horários, capacidade e proteções permanece no TypeScript.
O servidor volta a simular ao aceitar e compara o resultado com a pré-visualização.
Mudanças de versão, catálogo ou regras que afetem o resultado invalidam a proposta.
As propostas expiram após 30 minutos. A aceitação cria a versão e atualiza a
auditoria na mesma transação SQLite, incluindo a proteção contra duplo clique.
As marcas de origem acompanham o snapshot, pelo que sobrevivem ao refresh, ao
reinício e às exportações baseadas nessa versão.

A tabela agent_runs partilha a base de versões em exports/itineraries. Guarda
hash do pedido, ações/resumo/avisos, estado, versão base/final, modelo, tokens e
latência. Não guarda o texto integral do pedido nem o histórico da conversa.
Os diagnósticos registam códigos de erro, sem prompts ou exceções do fornecedor.
Não há troca automática de modelo: erros de acesso, disponibilidade, tempo ou
contrato são explícitos e deixam a viagem intacta.

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
| BEDROCK_MODEL_ID | Modelo configurável; predefinido eu.amazon.nova-pro-v1:0 |
| AWS_REGION | Região Bedrock; alternativa AWS_DEFAULT_REGION, depois eu-west-1 |
| BLU_AGENT_MAX_OUTPUT_TOKENS | Limite de saída, 1800 por defeito; 256 a 4096 |
| BLU_EXPORT_DIR | Armazenamento de versões e auditoria |
| PORTAL_PUBLIC_ORIGIN | Origem pública do proxy privado quando aplicável |

O serviço HTTP Python legado não é necessário para este fluxo. Se for usado,
exige BLU_AGENT_API_TOKEN; BLU_AGENT_ALLOWED_ORIGINS aceita apenas origens
explícitas separadas por vírgulas, sem wildcard. /health é público no serviço.
Não configurar segredos no Git. O portal chama o planeador por processo local.

## Exportação e validação

PDF e TXT continuam a usar os snapshots e o histórico existentes. O TXT preserva
o formato atual de instruções para o Canva, com indicação do idioma escolhido;
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
semântica de Nova Pro. A Fase 3 deverá validar acesso privado e modelo real,
com pelo menos 90% por operação e por idioma de conversa, e testar PDF/TXT em
PT, EN, ES, FR, DE e ZH. Não declarar esses critérios cumpridos nesta fase.
