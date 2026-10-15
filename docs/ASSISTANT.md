# Assistente BLU com Amazon Bedrock

## Primeira entrega

O painel do roteiro pede propostas ao Amazon Bedrock através de Converse.
O modelo executa na AWS; não existe modelo local nem fallback silencioso para
outro fornecedor. O portal mantém a autoridade sobre regras, catálogo e versões.

O fluxo é: pedido → proposta estruturada → validação → pré-visualização →
aceitar ou rejeitar. Aceitar volta a validar com o catálogo atual e guarda a
versão e a decisão na mesma transação SQLite. Rejeitar não cria uma versão.
Uma proposta expira após 30 minutos. Alterações concorrentes ou mudanças no
resultado da validação exigem outra pré-visualização.

A pré-visualização aparece após as mensagens, junto da resposta mais recente.
Escrever «ok» não executa alterações nem inicia outra inferência: se existir
uma proposta, o chat orienta para **Aceitar e guardar versão**; caso contrário,
explica que não há ações pendentes. Respostas informativas são identificadas
como não contendo alterações para aplicar. Erros de formato, permissões,
timeout e ligação são apresentados separadamente de indisponibilidade geral.

## Conversa e alternativas de substituição

O assistente recebe até oito mensagens recentes da viagem, limitadas a 1000
caracteres por mensagem e 6000 no total, além da proposta pendente lida no
histórico do servidor. Pode assim interpretar referências como «antes no dia 2»
sem considerar que uma proposta anterior já foi aplicada. A conversa é contexto,
nunca autorização: a aceitação continua no botão. Referências ambíguas exigem
esclarecimento. Não há memória entre viagens nem pesquisa em conversas antigas.

As mensagens recentes são enviadas ao Bedrock, incluindo texto escrito pelo
utilizador. Não incluir contactos ou notas pessoais nas mensagens. Esta extensão
não cria persistência de conversas no servidor; mantém o armazenamento no navegador.

Pedidos de opções podem devolver até três grupos de alternativas, com até três
ofertas por atividade. O modelo indica apenas identificadores. O servidor obtém
nomes, horários, preços e pendências da simulação com o catálogo aprovado, usando
as regras de substituição existentes. Opções inventadas, incompatíveis ou que
alterem atividades protegidas são recusadas.

**Pré-visualizar esta substituição** prepara uma nova proposta com a opção
escolhida, sem outra chamada ao modelo e sem criar uma versão. Só
**Aceitar e guardar versão** a aplica. A seleção volta a verificar catálogo,
validade da proposta e versão de origem. Propostas de opções sem alterações
nunca apresentam um botão que aplique o roteiro inteiro.

Ações iniciais: adicionar oferta, substituir, remover, reagendar, reorganizar,
ajustar capacidade, reservar manhã/tarde livre e marcar dia livre. É possível
combinar até oito ações; se uma falhar, nenhuma é aplicada. Identificadores
inexistentes, oferta inelegível e alterações a atividades protegidas ou
confirmadas são recusados. Os percursos antigos afetados deixam de ser apresentados
como atuais; esta entrega não volta a consultar o fornecedor de rotas.

O contrato está em `src/blu_ai/schemas/action-plan.json`, usado pelo planeador
Python e pelo validador TypeScript. O modelo não dispõe de ferramentas de escrita.
O contexto contém até 120 candidatos elegíveis, distribuídos entre os dias;
esta seleção ainda não é um ranking semântico. Nomes, emails, notas e campos de
confirmação não integram o contexto preparado. O texto escrito pelo utilizador
é enviado ao modelo: não incluir contactos ou outros dados pessoais no pedido.

## Execução na instância AWS

Preparar o grupo Python opcional, preservando os outros grupos necessários:

```bash
python -m uv sync --locked --group agent
```

`uv sync` pode remover pacotes de grupos não selecionados. Para o ambiente
completo, usar `--all-groups`, consultando primeiro
[a exceção de tradução](DEPENDABOT_PYTHON.md).

Configurar no ambiente do processo do portal:

```bash
export AWS_REGION=eu-west-1
export BEDROCK_MODEL_ID=eu.amazon.nova-pro-v1:0
```

O planeador usa a cadeia normal de credenciais boto3, incluindo a IAM Role do
SageMaker. O papel precisa de `bedrock:InvokeModel` para o perfil escolhido e
para os modelos nas regiões de destino da inferência. Não criar chaves estáticas.
O perfil por defeito pode encaminhar a inferência entre regiões europeias.
O predefinido é agora Nova Pro: passou o cenário de refinamento e alternativas
em que Nova Lite acumulou ações ou omitiu a remoção pedida. É uma avaliação
pontual, não uma garantia para todos os pedidos. O modelo continua configurável;
uma alteração de modelo pode alterar o custo por token.
Não é necessário iniciar `npm run agent` nem um servidor FastAPI para este fluxo.

Nesta configuração o portal lança um processo Python curto para chamar a AWS.
Só a orquestração e a validação executam na instância; o modelo executa no Bedrock.
A chamada tem timeout e não é repetida automaticamente pelo SDK. Há limites de
tamanho de contexto, ações e tokens. Tokens de entrada/saída e latência são
registados; não representam um cálculo monetário do custo.

## Orquestração gerida com Lambda

`infra/assistant/template.yaml` prepara uma função privada, sem URL público,
com limite de concorrência e acesso Bedrock por recursos explícitos. A entrada
é `blu_ai.planner.lambda_handler`; usa exatamente o planeador da instância.
Rever os ARNs do perfil e dos modelos antes de publicar com SAM. O template
não cria outro catálogo nem copia dados operacionais para a função.

Depois de uma publicação autorizada, configurar no portal:

```bash
export BLU_AGENT_LAMBDA_FUNCTION=nome-da-funcao-publicada
```

O papel da instância precisa apenas de `lambda:InvokeFunction` para essa função;
o papel Lambda recebe o acesso Bedrock. A ponte Python na instância autentica a
invocação por IAM. Sem esta variável, usa diretamente Bedrock. O template está
preparado, mas esta entrega não comprova um deployment Lambda.

## Segurança e armazenamento

`agent_runs` fica na mesma `history.sqlite` das versões, em `BLU_EXPORT_DIR`.
Guarda plano, decisão, versão de origem e executada, hash do pedido e métricas;
o texto original do pedido não fica nesta tabela. As mensagens continuam no
navegador. Os planos podem conter títulos públicos, pelo que esta base também
é dado operacional e deve ficar fora do Git. A auditoria é eliminada quando a
versão de origem é definitivamente eliminada, por relação com `ON DELETE CASCADE`.

O serviço FastAPI anterior é legado e não participa no novo fluxo. Os seus
endpoints, exceto saúde, exigem `BLU_AGENT_API_TOKEN` via Bearer. Não há CORS
público. Não expõe mensagens do SDK nem blocos de raciocínio interno.

A autenticação de trabalhadores e a separação de permissões entre utilizadores
continuam pendentes no portal; esta entrega não o torna pronto para exposição
pública multiutilizador.

## Validação e limites

Os testes `tests/test_agent_planner.py` usam mocks do Bedrock, verificam schema,
recusa de respostas incompletas, raciocínio privado e autenticação do legado.
`dmc-workspace/tests/assistant-actions.test.mjs` cobre simulação, proteções,
rejeição, expiração, concorrência e rollback da auditoria com versões temporárias.
O teste de navegador do assistente usa propostas simuladas e confirma que não
há alterações antes da aprovação.

`tests/agent_cases.json` conserva 11 cenários sintéticos: refinamento, remoção,
proteções, ambiguidade, opções sem escrita, ausência de candidatos, dia inexistente,
injeção no catálogo e na conversa, operação não suportada e pergunta informativa.
O avaliador exige contrato válido, ações exatas e alternativas com dia, alvo e
IDs corretos, sem opções duplicadas adicionais. Os casos de injeção verificam
um marcador sintético que não deve aparecer na resposta pública.

Listar os casos não chama a AWS:

```bash
python scripts/evaluate_agent.py --list
```

Para avaliar no fornecedor real, com custos AWS explicitamente autorizados:

```bash
python scripts/evaluate_agent.py --live --model eu.amazon.nova-pro-v1:0
```

Para limitar o custo, acrescentar `--case injecao_no_catalogo` ou repetir
`--case` para selecionar vários casos. Um nome desconhecido é recusado antes
de qualquer chamada. A saída identifica a categoria de cada cenário.
Sem `--live`, o script recusa chamadas. A avaliação
publica apenas resultado, modelo, tokens e latência, sem respostas brutas.

Os 11 cenários e os testes do avaliador foram verificados offline. Esta ampliação
não foi executada no Bedrock: a evidência real anterior continua limitada ao
cenário de refinamento. Uma resposta sem ações cumpre o critério de não escrita,
mas o avaliador não comprova a qualidade textual do esclarecimento, todos os
ataques de injeção nem todas as regras do domínio. A validação determinística
continua obrigatória antes de qualquer escrita.

A implementação é o primeiro incremento das Fases 0 e 1. Ainda faltam mover
entre dias, otimização de percursos pelo agente, edição assistida de briefing e
confirmações, identidade do operador e avaliação ampla de grounding/injeção.
Feedback, casos históricos, proatividade e restantes Fases 2–6 continuam no plano.
