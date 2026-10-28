# Fundamentação das decisões de arquitetura

Revisto em 28 de outubro de 2026. Este documento explica as escolhas que orientam o BLU AI System: o problema a resolver, a solução adotada e os compromissos que resultam dessa solução. Agrupa o conhecimento por tema, sem reproduzir o diário de incidentes, commits, instalações ou contagens de testes.

Código, testes e manifests prevalecem. Os procedimentos estão nos guias de cada área, as pendências em [Operações](OPERATIONS.md#pendências-para-produção) e a evolução das decisões no Git.
Uma implementação ou um ensaio local não comprova uma publicação ou autorização na AWS. O âmbito atual é operação individual no Code Editor em `eu-west-1`.

## Âmbito do produto e ambiente de execução

O projeto apoia a curadoria de viagens com fontes existentes, oferta aprovada e revisão humana. O objetivo é produzir propostas explicáveis e recuperáveis, sem se tornar um sistema de reservas, de confirmação automática de fornecedores ou de treino de modelos próprios.

O portal DMC permanece no SageMaker Code Editor, usando a sessão privada do utilizador. Esta escolha permite executar o fluxo no ambiente já utilizado, sem introduzir outro hosting como condição de utilização. O site público, concierge e Backoffice mantêm recursos AWS e fronteiras próprios.

A stack ECS/ALB/Cognito continua disponível como alternativa. O seu código e os objetivos cloud anteriores não tornam essa alternativa o destino ativo, nem constituem SLA ou orçamento para o Code Editor. Acesso público, colaboração multiutilizador e novas integrações exigem decisões próprias de âmbito.

Referências: [Arquitetura](ARCHITECTURE.md), [Operações](OPERATIONS.md) e [stack alternativa](../infra/CURATION_WORKSPACE.md).

## Separação de responsabilidades e linguagens

A aplicação combina ingestão de ficheiros, análise, edição interativa e geração de documentos. Concentrar tudo num serviço ou duplicar regras em Python e TypeScript tornaria menos claras a autoridade de escrita e a origem dos dados.

Python mantém ingestão, validação ETL, acesso ao catálogo, leituras de fontes, meteorologia, cálculo de troços e planeamento do agente. O portal usa Next.js e TypeScript para interface, curadoria, simulação, versões e PDFs. A comunicação local usa JSON por stdin/stdout, sem shell e sem criar um servidor HTTP por operação. Reutilizam-se os contratos existentes em vez de outro catálogo ou persistência paralela.

Observatório, apresentação e Monitoring são entradas independentes: o primeiro consulta o warehouse; a apresentação usa exemplos fictícios; o Monitoring observa e gere o seu acesso local. Ausência de imports entre estas aplicações não prova desuso. O agente e a tradução são subprocessos do portal, sem portas próprias. A fronteira de cada regra é identificada antes de qualquer migração.

Referências: [mapa de componentes e fronteiras](ARCHITECTURE.md#pontos-de-entrada-e-responsabilidades) e [modelo de dados](../reports/data_model_report.md).

## Fontes, qualidade e publicação do warehouse

As fontes comerciais contêm lacunas, textos livres, suplementos e propostas históricas. Misturar informação histórica com oferta atual, ou tratar ausência como valor confirmado, produziria propostas comercialmente enganadoras.

Por isso, Excel e PDF originais são preservados. O enriquecimento cruza chaves exatas, preenche lacunas e conserva os conflitos; não deduz identidades por semelhança nem substitui preços conhecidos por tarifas públicas de outra natureza.
A evidência identifica fonte, campo, valor e contexto temporal. Preços, horários, coordenadas e condições de uma oferta não são copiados para outra por aproximação.

Dados desconhecidos continuam desconhecidos. Aprovação editorial, publicação ETL, preço estimado e confirmação de fornecedor são estados diferentes. Custos conhecidos, pendências e totais por moeda ficam separados, sem converter ausência em zero ou assumir compatibilidade. Uma fonte pública não comprova disponibilidade para a viagem e uma republicação não prolonga a validade da evidência.

O ETL constrói numa área temporária, valida e só depois publica. Em falha, conserva ou recupera a entrega anterior. Os consumidores analíticos usam o warehouse publicado em leitura; não o corrigem manualmente. Campos opcionais podem estar ausentes em entregas compatíveis, mas identificadores obrigatórios e incompatibilidades estruturais não são ignorados.

Referências: [contrato ETL](DATA_PIPELINE.md), [evidência e validade por campo](OBSERVATORY.md) e [gate de publicação](../scripts/check_warehouse_release.py).

## Persistência, concorrência e recuperação

Reinstalar o código ou reconstruir o warehouse não pode apagar revisões aprovadas nem as propostas já entregues. São ciclos de vida distintos e têm de continuar recuperáveis mesmo quando o workspace é substituído.

S3 conserva releases separadas de fontes, warehouse e estado operacional. A máquina materializa uma cache SQLite e ficheiros de execução. SQLite permite transações e consultas locais, mas não é executado diretamente no S3. Catálogo, versões e PDFs não pertencem à reconstrução do warehouse.

A topologia mantém uma instância escritora. Vários processos podem partilhar a mesma base com revisões-base e transações; isso não aprova réplicas escritoras em máquinas distintas. Chaves idempotentes e write-ahead protegem o pedido antes do commit; a outbox conserva a sincronização por confirmar. Repetir uma operação não deve criar outra revisão. A fila é estado transitório, sem constituir outra fonte permanente de verdade.

Manifestos, hashes, tamanhos e integridade SQLite são necessários à recuperação.
Uma base íntegra mas vazia não comprova o restauro das aprovações. Checkpoints inválidos são rejeitados, mantendo o fallback para cópias válidas. Credenciais esessões são locais e não são transferidas pelo checkpoint.

A perda total da cache antes da confirmação S3 pode perder trabalho ainda local.
Reverter código também não reverte dados: rollback exige verificar esquema, snapshots, relações parentais e bytes PDF com a versão anterior. RPO e RTO têm de ser aceites e medidos no ambiente-alvo, sem transformar um ensaio sintético em SLA.

Referências: [estado operacional](DATA_PIPELINE.md#estado-operacional-do-portal), [recuperação](OPERATIONS.md#persistência-e-recuperação) e [testes de persistência](TESTING.md#portal).

## Curadoria supervisionada e versões imutáveis

Uma proposta deve ser rastreável ao briefing, à oferta publicada e à decisão do curador. Alterar silenciosamente uma entrega anterior impediria explicar o que foi efetivamente revisto e enviado ao cliente.

As regras determinísticas continuam a decidir elegibilidade, capacidade, horários e proteções. Alterações do assistente passam por simulação, pré-visualização e aceitação explícita. Edição manual ou por agente não bloqueia um dia automaticamente; proteção explícita e atividades confirmadas mantêm o seu significado. Regenerações amplas preservam trabalho manual.

Cada versão guarda snapshot, parentesco, hashes e bytes PDF. Reabrir consulta a última versão ativa no servidor e preserva o rascunho em caso de falha; não cria uma versão por leitura. Alterar o catálogo ou o desenho do renderer não reescreve snapshots e PDFs já persistidos.

O Lixo distingue retirada da vista ativa, restauro e eliminação definitiva.
Políticas de limpeza técnica não eliminam versões autoritativas por conveniência; a versão final mantém a confirmação de eliminação prevista no seu ciclo de vida.
Preservação legal prevalece sobre retenção automática.

Referências: [Portal](PORTAL.md), [política de retenção](../config/retention_policy.json) e [versões](../dmc-workspace/src/lib/version-store.ts).

## Entregas, tradução e apresentação ao utilizador

A entrega ao cliente e o diagnóstico técnico têm destinatários diferentes.
Informação útil à revisão não deve desaparecer, mas códigos internos e hashes não precisam de ocupar o documento comercial.

A interface e os novos PDFs apresentam nomes, condições, fontes públicas, pendências e confirmações. Identificadores técnicos continuam nos contratos internos e snapshots. O redesenho aplica-se a novos documentos, preservando os bytes históricos. Imagens de destino do dashboard não são fotografias certificadas de cada atividade; inserir fotografias no PDF exige seleção, licença e créditos adequados.

PDF e Prompt TXT derivam da versão guardada. O TXT é neutro em relação à ferramenta de destino, exclui contactos, referências de reserva e notas internas e não altera o estado ou os bytes do PDF DMC. Um documento criado externamente não substitui a entrega histórica do portal.

A tradução usa modelos locais para evitar enviar textos de propostas a outro fornecedor durante esse fluxo. Preserva números e valores estruturados e falha explicitamente quando não os consegue recuperar. Mandarim exige fonte CJK; validade estrutural e legibilidade não substituem revisão semântica humana.

Partilhas ligam versão, idioma, destinatário, consentimento e validade. Acesso incompleto, expirado ou revogado falha fechado. Enviar uma versão para o Lixo revoga as partilhas; restaurá-la não reabre acessos antigos. A exposição efetiva da ligação depende do hosting, não apenas da criação do token.

Referências: [entregas e versões](PORTAL.md#exportação-e-versões), [Prompt TXT](PORTAL.md#prompt-txt) e [partilhas](PORTAL.md#partilha-com-o-cliente).

## Planeador híbrido e autoridade do agente

Usar um modelo para todos os comandos acrescenta variabilidade a operações que já têm interpretação inequívoca. Por outro lado, regras isoladas não substituem a interpretação de pedidos ambíguos ou explicações. A avaliação do planeamento apenas pelo modelo mostrou que validade estrutural não garantia correção semântica.

A solução adotada combina compilação local de intenções explícitas com Nova Pro através do Bedrock nos pedidos que exigem o modelo. Ambos devolvem `AgentPlan` e passam pelas mesmas regras e aceitação. O contrato tem treze ações; o agente não recebe SQL, shell, escrita S3, operações administrativas ou reservas.

O contexto é minimizado para a viagem e versão autorizadas. Contactos, notas e referências privadas não são instruções nem contexto livre a transmitir ao fornecedor. Leituras de meteorologia e percursos reutilizam observações controladas; feedback e casos históricos aprovados são sinais, não prova de condições atuais nem mecanismos de treino automático.

Propostas inválidas, expiradas, duplicadas ou baseadas em versões obsoletas são recusadas. A aceitação volta a simular o resultado. Uma correção limitada pode receber um código sanitizado, nunca o erro bruto com dados do cliente. Falhas do fornecedor deixam a viagem intacta, sem troca silenciosa de modelo.

Timeout, tokens, modelo e orçamento são configuração do servidor. A reserva de custo no modo cloud precede a invocação. Os ensaios com mocks verificam contratos; qualidade semântica exige avaliação real autorizada, por operação e idioma.
Resultados antigos não aprovam todos os pedidos futuros nem execução autónoma.

Referências: [âmbito e contrato do assistente](ASSISTANT.md) e [avaliação controlada](../scripts/evaluate_agent.py).

## Identidade, fronteiras privadas e permissões

Uma role AWS da máquina permite acesso a recursos, mas não identifica por si só a pessoa que fez cada pedido no portal. Um nome enviado pelo navegador também não constitui autorização de servidor.

No destino atual, o acesso ao portal depende da sessão privada do Code Editor e o Monitoring tem autenticação própria. Um workspace académico pode partilhar uma role de ensino sem copiar credenciais, sessões ou estado privado entre instalações. Esta utilização não equivale a isolamento multiutilizador no portal.

A alternativa `alb-cognito` verifica claims assinadas, access token, emissor, cliente e sujeito correspondente, derivando o papel apenas de grupos conhecidos.
Memória servidor e ownership são ativados apenas com esse principal verificado.
O frontend e o agente não elevam permissões. Rascunhos permanecem no navegador no Code Editor; a existência do store servidor não ativa sincronização por si só.

Verificação de origem reduz escritas a partir de outros sites, mas não substitui autenticação. Principais Backoffice são explícitos: sem lista de confiança, o papel de análise não é criado. Administração IAM e dos buckets fica fora da role operacional; uma recusa de metadados não demonstra recusa de leitura autorizada.

Referências: [identidade](ARCHITECTURE.md#identidade-e-autorização), [política](../config/identity_policy.json) e [retenção S3](S3_RETENTION.md).

## Concierge, consentimento e separação do Backoffice

O chat público recebe conteúdo não fiável e pode falhar sem impedir o trabalho do curador. Por isso, site, ingestão de eventos, dados e Backoffice são unidades separadas do planeador transacional do portal.

A referência BLU correlaciona canais; não autentica clientes. Retenção de conversa e consentimento analítico são escolhas distintas. Eventos sintéticos ficam fora dos indicadores reais. Filas desacoplam resposta, armazenamento e CRM; os consumidores deduplicam eventos em vez de assumir entrega única.

A API pública tem limites de tráfego e o chat usa Guardrail e instruções de âmbito. Esses controlos não provam proteção integral contra abuso ou aprovação de custos. O RAG limita conhecimento ao prefixo aprovado, e as recomendações ou tarefas de seguimento não contactam clientes automaticamente. WhatsApp exige validação do webhook e aprovação no fluxo de envio.

O portal reutiliza as tabelas DynamoDB existentes. Uma API de Leads autónoma e uma intranet são propostas, sem constituírem novos serviços ativos apenas por estarem documentadas.

Referências: [arquitetura AWS separada](../infra/SPLIT_ARCHITECTURE.md), [proposta Leads](LEADS_API.md) e [proposta de intranet](INTRANET.md).

## Dependências, testes e identificação da entrega

Instalações que dependem de pacotes globais ou de caches de outra máquina não permitem distinguir uma alteração de código de uma alteração do ambiente.
Por isso, manifests e lockfiles são a fonte de dependências, com grupos Python opcionais e requirements gerados, sem edição manual desses exports.

A tradução usa CPU e o índice específico PyTorch, evitando dependências GPU sem utilização neste fluxo. O override Stanza/Argos mantém a versão de segurança resolvida sem fingir que o metadata upstream é compatível; a exceção é explícita e tem de ser reavaliada quando as dependências mudarem.

Testes usam dados sintéticos, diretórios temporários e mocks de fornecedores por omissão. Isso protege fontes e operações reais e permite testar falhas e concorrência. Testes com notificações não herdam a configuração SNS real.
Auditorias são datadas: os avisos do branch principal e as versões do candidato são comparados, mas alertas não são dispensados para substituir integração.

Na alternativa cloud, a imagem é identificada por digest e ligada à revisão, SBOM e proveniência. Assinatura verifica produtor; hashes verificam integridade.
O smoke tem de usar os mesmos bytes e comandos da entrega. Publicação preserva manifests e digests e conserva uma referência anterior para rollback. Nada disso ativa ECS ou ECR na operação Code Editor nem autoriza publicação.

Referências: [dependências](DEPENDABOT_PYTHON.md), [testes](TESTING.md) e [entrega da imagem](../infra/IMAGE_DELIVERY.md).

## Monitoring, acesso às interfaces e limites operacionais

O painel local permite observar serviços, disco, dados, filas, backups e métricas reduzidas, mas partilha o destino de falha da máquina. Separar disponibilidade técnica, prontidão funcional e atuação operacional evita anunciar cobertura que não foi demonstrada.

O Monitoring não altera o catálogo nem aumenta as permissões do agente. A telemetria conserva códigos e métricas, sem prompts, respostas ou contactos. SNS é transporte opcional de transições deduplicadas, com repetição persistente; entrega técnica não comprova receção ou atuação do responsável.

O Space AWS continua a ser Code Editor quando o utilizador trabalha pelo VS Code remoto. Edição e comandos remotos usam o mesmo ambiente, mas a sessão web tem o seu próprio encaminhamento. Os URLs pertencem ao Space atual, descoberto por metadados e DescribeSpace. Uma falha não reutiliza outro domínio. O encaminhamento e a abertura pertencem à sessão web do Code Editor; um túnel SSH não é a mesma coisa. O launcher distingue falha de testes, serviços saudáveis e abertura de navegador pendente. `blu up` arranca o ambiente preparado; `blu it` é recuperação autenticada com efeitos S3.

Uma sonda fora da máquina, o canal e o prazo de resposta continuam a exigir implementação/aceitação próprias. Um HTTP 200 ou uma cópia restaurada localmente não comprova recuperação entre máquinas, SLA, RPO ou RTO do ambiente final.

Referências: [Operações](OPERATIONS.md), [runbook](MONITORING_RUNBOOK.md) e [pendências de monitoring](OPERATIONS.md#pendências-de-monitoring).

## Manutenção do conhecimento e autoria

Documentação organizada por assunto permite encontrar um contrato sem percorrer o relato de uma execução. Cada tema tem um guia responsável; este documento explica a fundamentação, sem duplicar comandos, catálogos de fornecedores ou contagens transitórias. A inicialização de qualquer Space segue o mesmo [guia](ONBOARDING.md), desde o clone até à abertura visual dos dashboards; um guia de segundo workspace separado duplicaria esse fluxo. O Git conserva a evolução; o plano contém trabalho aberto.

CODEOWNERS identifica a revisão segundo a autoria apurada no histórico de criação, sem atribuir o projeto inteiro por uma regra global. Diretórios de autoria mista mantêm regras específicas; mover documentação exige preservar a atribuição e atualizar referências. Proveniência de terceiros e atribuições de autoria não são eliminadas pela consolidação.

Uma proposta continua proposta até ser implementada e aceite. Da mesma forma, edição documental, commit, teste, publicação e deployment são atos distintos.
A documentação não concede autoridade sobre fontes, dados operacionais, infraestrutura, custos ou contactos com terceiros.