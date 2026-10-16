# Blu — Assistente de Curadoria

Revisto em 2026-10-16. Desenvolvimento no branch
`pc/assistant-agent-for-blu-curator`, preservando a integração HTML/Python.
Este documento mantém o âmbito e o estado das fases. Os contratos e comandos
operacionais estão em [docs/ASSISTANT.md](docs/ASSISTANT.md), as tarefas de cada
incremento em [PLAN.md](PLAN.md) e a evidência datada em
[docs/DECISIONS.md](docs/DECISIONS.md). Código e testes prevalecem sobre o plano.

## Estado atual

O Blu já propõe alterações estruturadas em linguagem natural através de Amazon
Bedrock Converse. O modelo predefinido é `eu.amazon.nova-pro-v1:0`, configurável.
Não existe modelo local nem fallback silencioso. A instância AWS executa apenas
orquestração e validação; o modelo executa no Bedrock com credenciais IAM.

```mermaid
flowchart LR
    U[Trabalhador] --> P[Portal Next.js]
    P --> A[Planeador Python]
    A --> B[Amazon Bedrock Converse]
    B --> S[Proposta estruturada]
    S --> D[Validação determinística do portal]
    C[Catálogo aprovado] --> D
    D --> R[Pré-visualização]
    R --> H[Aceitar ou rejeitar]
    H --> V[Versão e auditoria atómicas]
```

Base implementada e alargada nesta iteração:

- Contrato partilhado Python/TypeScript e treze tipos de ações.
- Validação integral, pré-visualização e aceitação/rejeição explícitas.
- Proteções, expiração, concorrência e auditoria na base de versões existente.
- Contexto recente limitado à viagem e proposta pendente validada no servidor.
- Alternativas reais do catálogo, sem inventar nomes, preços ou disponibilidade.
- Escolha de uma alternativa sem nova inferência; gravação só após aceitação.
- Resumo do impacto calculado no servidor: atividades, horários, ordem, capacidade
  e subtotais conhecidos por moeda, distinguindo custos pendentes.
- Mensagens e erros preservados no chat; «ok» não executa nem chama o modelo.
- Classificação segura de erros de permissões, formato, timeout e ligação.
- Template Lambda privado preparado, ainda sem deployment.

As Fases 0–6 têm agora incrementos funcionais para validação conjunta: mover
entre dias, otimização geográfica com validação de horários, alterações limitadas
ao briefing, preparação de confirmações pendentes, ranking de candidatos,
regeneração parcial, feedback, qualidade, casos revistos, rascunhos e métricas.
A área `/assistant` exige token e identidade configurados no servidor. Isto não
substitui SSO multiutilizador nem comprova qualidade semântica ampla do modelo.
A matriz de aceitação está em [validação das seis fases](docs/ASSISTANT_VALIDATION.md).
Voos dependem de API escolhida; Lambda não foi publicado. Agendamento de CI,
chamadas pagas e envio de comunicações não são ativados por esta implementação.

### Evidência e limites

- Última validação do portal: 116 testes aprovados, um ignorado; build aprovado.
- Interface em 390/1600 px validada com fornecedor simulado e dados temporários.
- Última validação Python do agente e meteorologia: 23 testes aprovados sem chamadas externas.
- Avaliador com 18 cenários sintéticos e comparação estrita de ações, dias, alvos
  e alternativas; recusa contrato inválido, ações adicionais e opções duplicadas.
- Casos incluem ambiguidade, proteções, ausência de candidatos e injeção em dados.
  A nova bateria ainda não foi executada no Bedrock.
- Nova Pro passou um cenário real de refinamento e alternativas; Nova Lite falhou
  duas tentativas anteriores. Esta amostra não comprova qualidade geral.
- Tokens e latência são registados; cálculo monetário de custos continua pendente.

Consultar os casos sem chamadas AWS:

```bash
python scripts/evaluate_agent.py --list
```

Execução real exige autorização aplicável para custos e `--live`; `--case`
permite selecionar cenários. Testes offline verificam o avaliador e os contratos,
não demonstram que o modelo resiste a todos os ataques ou interpreta todos os pedidos.

---

## 1. O que já existe

### Geração de itinerários

Já está implementado:

- Briefing dividido em etapas.
- Preferências, restrições, orçamento, mobilidade e alimentação.
- Geração com atividades, restaurantes e experiências.
- Aplicação de regras de curadoria.
- Horários propostos e deteção conservadora de conflitos.
- Distribuição por dias.
- Cálculo de preços conhecidos.
- Inclusão de deslocações.
- Persistência numa versão imutável.

A geração principal é determinística e passa por:

- `src/app/api/itineraries/route.ts`
- `src/lib/curation.ts`
- `src/lib/catalog-matching.ts`
- `src/lib/itinerary-scheduling.ts`
- `src/lib/road-routing.ts`

### Edição pelo assistente

A lógica determinística existente suporta comandos explícitos para:

- Adicionar uma oferta do catálogo.
- Substituir uma atividade.
- Reagendar.
- Reorganizar um dia.
- Remover.
- Criar períodos livres.
- Transformar um dia em dia livre.
- Ajustar a capacidade diária.
- Otimizar a sequência geográfica.

Também já protege atividades bloqueadas ou confirmadas e impede alterações incompatíveis com orçamento, horários, exclusões e regras.

O novo fluxo Bedrock permite adicionar, substituir, remover, reagendar,
reorganizar, mover entre dias, otimizar a sequência geográfica estimada,
ajustar capacidade, reservar manhã/tarde livre, marcar dia livre e regenerar
apenas um dia. Pode preparar campos de confirmação sem confirmar uma reserva
e editar um subconjunto explícito do briefing, sujeito à elegibilidade atual.

Os caminhos seguintes são relativos a `dmc-workspace/`:

- `src/lib/assistant-editing.ts`: regras determinísticas reutilizadas.
- `src/lib/assistant-impact.ts`: diferenças e custos conhecidos antes/depois.
- `src/lib/assistant-actions.ts`: contrato, contexto, simulação e alternativas.
- `src/lib/agent-audit-store.ts`: proposta, decisão e ligação à versão.
- `src/app/api/assistant/plan/route.ts`: entrada do novo fluxo estruturado.
- `src/hooks/useWorkspace.ts`: conversa e interação com as propostas.

### Matching do catálogo

Já existe um perfil estruturado que permite associar registos a:

- Interesses.
- Nível Soft, Classic ou Signature.
- Ritmo.
- Horário de início.
- Alimentação.
- Mobilidade.
- Esforço físico.
- Idades.
- Capacidade do grupo.
- Orçamento.
- Preferência de acompanhamento.

Apenas itens aprovados devem entrar na geração determinística.

### Persistência e versionamento

Já existe:

- Histórico imutável de versões.
- Deteção de conflitos de edição.
- Hash do snapshot e cadeia de versões.
- PDFs e variantes linguísticas associados à versão.
- Preservação de propostas antigas após alterações no catálogo.
- Histórico de revisões do catálogo.
- Estados Rascunho, Em revisão, Aprovado e Inativo.

### Integrações existentes

- Open-Meteo para meteorologia.
- OSRM para rotas.
- Amazon Bedrock Converse no novo planeador; LangChain/LangGraph no serviço legado.
- Tradução local.
- Exportação PDF.
- Partilha por ligação ou documento.

---

## 2. O que está incompleto

### Edição e contexto ainda parciais

O endpoint `/api/assistant/plan` interpreta pedidos e valida ações antes
de propor escrita. O painel permite escolher o contexto; a área operacional
acrescenta o contexto da revisão. O briefing tem campos permitidos explícitos;
datas e dados do cliente não são editados pelo agente. Confirmações preparadas
continuam pendentes. Atividades protegidas ou confirmadas não são movidas,
reorganizadas nem editadas pelo agente.

As propostas podem combinar até oito ações. Uma falha invalida o conjunto;
a capacidade diária e as atividades protegidas continuam a ser verificadas.
Isto não comprova interpretação correta de todos os pedidos compostos.

### Separação do serviço legado

O fluxo principal usa `src/blu_ai/planner.py`, candidatos aprovados pelo portal
e regras determinísticas existentes. Não usa a geração textual do endpoint
legado `/api/agent/curate`. Essa geração não está integrada no fluxo principal.
As ferramentas legadas não devem ser tratadas como autoridade paralela de regras.
A meteorologia Python já é partilhada entre portal e ferramenta do agente.

### Conversas e auditoria

As mensagens ficam no `localStorage`, separadas do snapshot autoritativo.
O planeador recebe até oito mensagens recentes, limitadas a 1000 caracteres por
mensagem e 6000 no total. Não há memória entre viagens.

A tabela `agent_runs`, na mesma `history.sqlite` das versões, guarda plano,
hash do pedido, decisão, versão de origem/executada e métricas. O texto original
do pedido não é guardado nesta tabela. Proposta e decisão não substituem uma
identidade autenticada individual: a API operacional usa token e identidade do
servidor; SSO e papéis por trabalhador permanecem por definir.

### Operação AWS e segurança

A cadeia normal de credenciais IAM está implementada, sem exigir chaves fixas.
A chamada tem timeout e falha explícita, sem modelo falso de fallback.
A orquestração Lambda está preparada, mas não publicada.

O serviço HTTP legado exige Bearer token, exceto na saúde, e não tem CORS público.
O fluxo principal valida a origem exata do portal. O contexto usa campos explícitos
para reduzir dados pessoais; o texto escrito no chat continua a ser enviado ao
Bedrock. Fontes e respostas externas são dados não fiáveis, nunca instruções.
Blocos de raciocínio interno e detalhes privados do SDK não são apresentados.

A área operacional está fechada por defeito e autentica leitura/escrita com
Bearer token; a identidade vem de `BLU_OPERATOR_ID`, não do corpo do pedido.
Decisões exigem confirmação explícita e são auditadas. Autenticação individual,
papéis, consentimento e políticas de retenção para produção continuam pendentes. O portal não está validado para exposição
pública multiutilizador. As proteções atuais não equivalem a resistência geral
comprovada contra injeção de instruções.

### Avaliação ainda limitada

Há testes automatizados de contrato, falhas AWS simuladas, propostas, proteções,
concorrência, rollback e interface. O avaliador foi alargado a 11 casos sintéticos,
mas esta bateria ainda não foi executada no fornecedor real. Falta avaliação ampla
por personas, qualidade das explicações, grounding, injeção, latência e custo
monetário. Uma resposta sem ações passa o critério de não escrita; não comprova
que o esclarecimento textual seja adequado.

---

## 3. O que falta desenvolver

### Feedback pós-viagem

Implementado em `feedback-store.ts` e na área `/assistant`, na mesma base de
versões. A viagem aponta para uma única versão efetivamente realizada; o
questionário exige resposta a todos os cartões e o feedback entregue é imutável.
A revisão do catálogo fica desconhecida nos snapshots antigos que não a registam.

O registo inclui:

- Viagem e versão efetivamente realizadas.
- Identificador estável do item do catálogo.
- Revisão do catálogo usada.
- Estado: realizada, cancelada, substituída ou não aplicável.
- Avaliação geral.
- Qualidade da experiência.
- Exatidão da descrição.
- Qualidade do fornecedor.
- Adequação do horário e duração.
- Relação qualidade/preço.
- Acessibilidade.
- Cumprimento de restrições alimentares.
- Comentário do trabalhador.
- Data e autor da avaliação.

O questionário deve exigir uma resposta para cada card, mas permitir “Não aplicável” quando a atividade não se realizou.

### Qualidade do catálogo

Implementados agregados por item e janelas de 30/90/180 dias. O painel apresenta:

- Número de utilizações.
- Número de avaliações.
- Média e distribuição.
- Taxa de cancelamento.
- Taxa de substituição.
- Problemas recorrentes.
- Tendência nos últimos 30, 90 e 180 dias.
- Data da última utilização.
- Estado do alerta.

Um alerta não deve desativar automaticamente o item. O trabalhador deverá poder:

1. Consultar as avaliações.
2. Rever o registo.
3. Manter ativo.
4. Colocar em revisão.
5. Inativar.

A inativação deve impedir novas recomendações e preservar todo o histórico.

### Knowledge Base histórica

A recuperação estruturada está implementada em `historical-cases.ts`. Exige
feedback completo, média mínima 4, ausência de incidentes e aprovação humana.
Indexa apenas um perfil permitido e IDs/revisões dos itens realizados. Exclui
versões no Lixo; o restauro volta a torná-las pesquisáveis. Não copia nomes,
contactos, comentários ou PDFs para o contexto do modelo.

A pesquisa atual usa pontuação estruturada e termos textuais, sem base vetorial.
Os campos de perfil e sinais considerados incluem:

- Campos estruturados do briefing.
- Destino.
- Datas e duração.
- Tipo de grupo.
- Interesses.
- Restrições.
- Nível da proposta.
- Itens selecionados.
- Alterações do trabalhador.
- Feedback final.
- Resultado das recomendações anteriores.

Uma pesquisa por similaridade estruturada e texto integral em SQLite/PostgreSQL será mais simples, barata e explicável.

Embeddings devem ser adicionados apenas se os testes mostrarem que a pesquisa estruturada não é suficiente.

---

## 4. Arquitetura recomendada

```mermaid
flowchart TD
    UI[Portal Next.js] --> ORQ[Orquestrador Blu]
    ORQ --> LLM[Agente Bedrock]
    ORQ --> ACT[Registo de ações]
    ACT --> VAL[Validação determinística]
    VAL --> CAT[Catálogo aprovado]
    VAL --> SCH[Horários e orçamento]
    VAL --> MAP[Rotas e meteorologia]
    VAL --> VER[Versionamento]
    ORQ --> AUD[Auditoria do agente]
    FB[Feedback pós-viagem] --> Q[Qualidade do catálogo]
    Q --> KB[Casos históricos]
    KB --> ORQ
```

### Princípio central

O modelo não deve alterar diretamente:

- Itinerários.
- Catálogo.
- Confirmações.
- Versões.
- Estado de aprovação.
- Lixo.

O contrato atual (`src/blu_ai/schemas/action-plan.json`) exige ações estruturadas,
por exemplo (identificadores ilustrativos):

```json
{
  "summary": "Substituir a atividade da tarde por uma opção coberta.",
  "actions": [
    {
      "type": "replace_item",
      "dayNumber": 2,
      "itemId": "catalog:item-123",
      "catalogId": "catalog:item-456"
    }
  ],
  "warnings": [],
  "requiresConfirmation": true
}
```

Depois:

1. O Next.js valida o schema.
2. Resolve os identificadores.
3. Executa a lógica determinística existente.
4. Mostra uma pré-visualização.
5. O trabalhador aceita ou rejeita.
6. A alteração aceite cria uma versão.
7. A decisão fica registada para aprendizagem futura.

### Registo de ações

Disponíveis: `add_catalog_item`, `replace_item`, `remove_item`,
`reschedule_item`, `reorder_day`, `set_day_capacity`, `add_free_period` e
`set_free_day`. `alternatives` é um campo separado para opções de substituição,
não uma ação que as aplique.

Também disponíveis: `move_item`, `optimize_route`, `update_brief`,
`update_pending_confirmation` e `regenerate_day`. `ranking` ordena candidatos
para revisão, sem os adicionar. A escolha gera outra proposta validada.

Todas as ações atuais exigem confirmação humana. Atividades bloqueadas ou
confirmadas são recusadas; a aceitação de uma proposta não contorna essa proteção.
O agente não dispõe de ações de edição do catálogo.

### Fonte única de regras

A lógica TypeScript deve continuar a ser a autoridade para:

- Elegibilidade.
- Horários.
- Preços.
- Orçamento.
- Mobilidade.
- Alimentação.
- Estados do catálogo.
- Proteções.
- Versionamento.

O Python deve consultar essa lógica através de APIs ou receber candidatos já validados. Não deve manter uma segunda implementação independente das regras.

---

## 5. Modelo de dados recomendado

### Auditoria do agente

A implementação atual usa uma única tabela `agent_runs` na base de versões,
com plano JSON e decisão; não criou `agent_actions` nem outra persistência.
Guarda hash do pedido em vez do texto original e ainda não identifica o operador.
Os campos e a segunda tabela abaixo são propostas históricas para revisão,
não o esquema implementado. Confirmar o esquema em `agent-audit-store.ts`.

Proposta histórica para `agent_runs`:

- `id`
- `trip_id`
- `base_version`
- `user_id`
- `instruction`
- `model_provider`
- `model_id`
- `created_at`
- `completed_at`
- `status`
- `latency_ms`
- `input_hash`
- `error_code`

Proposta histórica para `agent_actions` (não implementada):

- `run_id`
- `sequence`
- `action_type`
- `arguments`
- `validation_result`
- `explanation`
- `accepted_at`
- `rejected_at`
- `executed_version`
- `rejection_reason`

### Feedback

Nova tabela `trip_feedback`:

- `id`
- `trip_id`
- `version`
- `completed_by`
- `completed_at`
- `overall_notes`

Nova tabela `item_feedback`:

- `trip_feedback_id`
- `itinerary_item_id`
- `catalog_id`
- `catalog_revision`
- `outcome`
- `overall_rating`
- `accuracy_rating`
- `supplier_rating`
- `schedule_rating`
- `value_rating`
- `accessibility_rating`
- `dietary_rating`
- `issue_tags`
- `comment`

Nova tabela `catalog_quality_alerts`:

- `catalog_id`
- `alert_type`
- `severity`
- `evidence`
- `created_at`
- `resolved_at`
- `resolved_by`
- `resolution`

### Casos históricos

Nova tabela `historical_cases` ou uma vista materializada com:

- Briefing normalizado.
- Snapshot final.
- Itens utilizados.
- Alterações aceites e rejeitadas.
- Feedback.
- Resultado por item.
- Qualidade global.

Os dados históricos devem referenciar identificadores estáveis, nunca apenas nomes.

---

## 6. Funcionalidades adicionais de IA

### Prioridade alta

#### Verificação preventiva da proposta

Antes de exportar:

- Detetar sobreposições.
- Identificar horários não confirmados.
- Verificar preços desconhecidos.
- Detetar atividades incompatíveis.
- Sinalizar dias demasiado preenchidos.
- Confirmar que todas as deslocações são possíveis.

#### Recomendações proativas

O Blu pode apresentar sugestões sem alterar:

- Alternativa para chuva.
- Alternativa acessível.
- Alternativa dentro do orçamento.
- Substituição de um item com avaliações negativas.
- Atividade próxima para reduzir deslocações.
- Restaurante compatível com a dieta.

#### Explicabilidade

Cada recomendação deve mostrar:

- Preferências correspondentes.
- Regras aplicadas.
- Dados usados.
- Alertas.
- Informação desconhecida.
- Razão para rejeitar alternativas.

#### Qualidade do briefing

Antes de gerar, o agente pode identificar:

- Respostas contraditórias.
- Campos importantes em falta.
- Orçamento incompatível com o nível pretendido.
- Mobilidade que exige esclarecimento.
- Restrições alimentares sem detalhe suficiente.

### Prioridade média

#### Gestão de perturbações

- Chuva.
- Encerramento inesperado.
- Atraso no voo.
- Cancelamento de fornecedor.
- Alteração de horário.

O Blu deve propor um plano alternativo e mostrar o impacto antes da aplicação.

#### Análise das decisões dos trabalhadores

Registar:

- Recomendações aceites.
- Recomendações rejeitadas.
- Alterações manuais posteriores.
- Itens frequentemente substituídos.
- Motivos de rejeição.

Isto permite ajustar o ranking sem treinar diretamente o modelo com dados não revistos.

#### Qualidade de conteúdo

- Detetar descrições desatualizadas.
- Identificar duplicados no catálogo.
- Sugerir campos em falta.
- Verificar consistência entre idiomas.
- Detetar texto pouco adequado a uma proposta para cliente.

### Prioridade posterior

- Previsão de probabilidade de aceitação de uma proposta.
- Estimativa de risco operacional.
- Previsão de duração real.
- Otimização multiobjetivo entre satisfação, custo e deslocação.

Estas funcionalidades exigem dados de resultado suficientes e não devem ser implementadas antes do feedback estruturado.

---

## 7. Plano por fases

### Fase 0 — Contratos, segurança e avaliação

Prioridade: crítica.

- [x] Definir ações estruturadas do agente.
- [x] Definir quais exigem confirmação humana.
- [x] Criar schemas comuns entre TypeScript e Python.
- [x] Corrigir Bedrock para usar IAM Role.
- [x] Restringir CORS.
- [x] Remover dados pessoais e instruções dos logs.
- [ ] Impedir que conteúdo do catálogo seja tratado como instrução.
- [x] Não expor raciocínio interno do modelo.
- [x] Criar conjunto de testes e personas sintéticas.
- [ ] Medir grounding, validade, latência e custo.

Estado parcial: separação entre dados e instruções implementada no prompt e
validação, mas resistência ampla a injeção ainda não comprovada. Existem 18 casos
sintéticos, incluindo personas de família e mobilidade; avaliação real ampla
continua pendente. Latência e tokens são medidos; a estimativa monetária depende
de tarifas explicitamente configuradas.

Esta fase é dependência de todas as restantes.

### Fase 1 — Blu como editor transacional

Prioridade: crítica.

- [x] Criar endpoint de planeamento de ações.
- [x] Fazer o Bedrock devolver ações estruturadas.
- [x] Validar cada ação no Next.js.
- [x] Apresentar pré-visualização antes/depois.
- [x] Permitir aceitar ou rejeitar.
- [x] Executar usando a lógica existente.
- [ ] Permitir comandos compostos, como aliviar um dia, preservar reservas confirmadas e reduzir o custo numa única operação.
- [x] Disponibilizar contexto de briefing, catálogo, itinerário, confirmações e entrega.
- [x] Preparar campos de confirmação com dados fornecidos, sem inventar evidência.
- [x] Disponibilizar um modo de simulação que calcule o impacto sem guardar imediatamente.
- [x] Criar uma versão após aceitação.
- [x] Comparar snapshots com atividades, horários e custos conhecidos por moeda.
- [x] Registar hash do pedido, plano validado e decisão.

Implementados também mover entre dias e regeneração parcial. Pedidos compostos
continuam limitados a oito ações e exigem avaliação semântica no modelo real.
Identidade operacional é de uma conta configurada por processo, sem SSO individual.

Resultado pretendido: executar linguagem natural sem contornar regras.

### Fase 2 — Geração e matching assistidos

Prioridade: alta.

- [x] Manter a geração determinística como base.
- [x] Pedir ao agente para ordenar candidatos elegíveis.
- [x] Recuperar casos históricos semelhantes.
- [x] Mostrar razões do ranking.
- [x] Explicar que respostas do briefing e regras de curadoria sustentam cada recomendação.
- [x] Diagnosticar conflitos de horário, deslocações inviáveis, excesso de atividades, orçamento ultrapassado e informação em falta.
- [x] Propor alternativas elegíveis quando uma atividade estiver fechada, exceder o orçamento ou contrariar restrições.
- [x] Comparar a proposta do agente com a proposta base.
- [x] Nunca permitir que o modelo introduza um item inexistente ou inativo.
- [x] Guardar a origem de cada recomendação.

### Fase 3 — Feedback pós-viagem

Prioridade: alta.

- [x] Criar estado “Viagem concluída — feedback pendente”.
- [x] Apresentar questionário card a card.
- [x] Tornar obrigatória uma resposta ou “Não aplicável”.
- [x] Guardar avaliações ligadas à versão e revisão do catálogo.
- [x] Criar página de histórico de avaliações.
- [x] Calcular tendências e alertas.
- [x] Sinalizar campos em falta, possíveis duplicados, revisão antiga e feedback negativo.
- [x] Encaminhar alertas para revisão do catálogo existente, sem reescrever conteúdo automaticamente.
- [x] Permitir revisão/inativação com motivo, autenticação e controlo de revisão.
- [x] Preservar todas as avaliações após inativação.

### Fase 4 — Knowledge Base histórica

Prioridade: média.

- [x] Indexar snapshots finais.
- [x] Indexar alterações e decisões do trabalhador.
- [x] Associar feedback.
- [x] Criar pesquisa por casos semelhantes.
- [x] Reutilizar estruturas de propostas bem avaliadas sem copiar dados pessoais dos clientes.
- [x] Usar filtros estruturados e pesquisa textual.
- [x] Usar pesquisa estruturada/textual como base; embeddings não introduzidos.
- [x] Excluir casos sem qualidade mínima ou sem resultado conhecido.

### Fase 5 — Integrações e proatividade

Prioridade: média.

- [x] Unificar meteorologia e rotas como adaptadores do portal.
- [x] Acrescentar cache, timeout e provenance.
- [x] Criar alertas de chuva, encerramento e conflito.
- [x] Apresentar indicadores proativos, incluindo reservas sem confirmação, desvio do orçamento e atividades exteriores afetadas pela meteorologia.
- [x] Permitir regeneração parcial de um dia.
- [x] Propor reorganização/regeneração sob pedido, preservando confirmações; percursos alterados exigem nova validação.
- [ ] Integrar voos quando existir uma API escolhida.
- [x] Preparar fornecedores, mapas ou reservas sem confirmar automaticamente.
- [x] Preparar o email de partilha e um resumo da proposta no idioma do cliente, sempre sujeitos a revisão.

### Fase 6 — Operação e melhoria contínua

- [x] Dashboard de desempenho do Blu.
- [x] Taxa de aceitação das sugestões.
- [x] Motivos de rejeição.
- [x] Indicador de versões editadas fora das decisões do agente, sem inferir causalidade.
- [x] Executar um controlo de qualidade antes da exportação, cobrindo conteúdo, idiomas, preços, reservas e campos pendentes.
- [x] Tokens e latência; estimativa monetária apenas com tarifas configuradas.
- [ ] Testes periódicos contra regressão e prompt injection.
- [ ] Comparação controlada de modelos.
- [ ] Aprovação humana antes de alterar prompts ou rankings.

---

## 8. Mapa de implementação e evolução

### Portal existente

Os itens seguintes incluem evolução futura. O fluxo atual usa
`src/lib/assistant-actions.ts`, `src/lib/assistant-conversation.ts` e
`src/lib/agent-audit-store.ts`, relativos a `dmc-workspace/`.

- `dmc-workspace/src/app/api/assistant/plan/route.ts`
  - Orquestração, validação e decisões das propostas estruturadas.

- `dmc-workspace/src/components/AIAssistantPanel.tsx`
  - Pré-visualização, explicações, aceitar e rejeitar.

- `dmc-workspace/src/hooks/useWorkspace.ts`
  - Aplicação, persistência e versionamento das ações.

- `dmc-workspace/src/lib/assistant-editing.ts`
  - Extrair comandos para um registo de ações reutilizável.

- `dmc-workspace/src/lib/catalog-matching.ts`
  - Ranking explicável e sinais históricos.

- `dmc-workspace/src/lib/curation.ts`
  - Geração base e integração do ranking.

- `dmc-workspace/src/lib/snapshot-validation.ts`
  - Metadados do agente e feedback, quando aplicável.

- `dmc-workspace/src/lib/version-store.ts`
  - Auditoria, feedback e ligação às versões.

- `dmc-workspace/src/lib/catalog-store.ts`
  - Alertas de qualidade e histórico de avaliações.

- `dmc-workspace/src/types/index.ts`
  - Contratos das ações, recomendações e feedback.

- `dmc-workspace/src/app/catalog/page.tsx`
  - Qualidade, tendências, alertas e decisão de inativação.

- `dmc-workspace/src/components/ActivityCard.tsx`
  - Estado do feedback e explicação da recomendação.

- `dmc-workspace/src/lib/activity-confirmation.ts`
  - Apoio do agente aos dados e evidências ainda em falta.

- `dmc-workspace/src/lib/proposal-budget.ts` e `dmc-workspace/src/lib/itinerary-pdf.ts`
  - Diagnóstico de preços, controlo de qualidade e validação antes da exportação.

- `dmc-workspace/src/app/api/shares/route.ts`
  - Preparação assistida e supervisionada da comunicação com o cliente.

### Módulos existentes e módulos futuros

`assistant-actions.ts` e `agent-audit-store.ts` já existem. Os restantes nomes
abaixo são sugestões de decomposição futura, não módulos obrigatórios.

- `src/lib/assistant-actions.ts`
- `src/lib/assistant-policy.ts`
- `src/lib/agent-audit-store.ts`
- `src/lib/feedback-store.ts`
- `src/lib/catalog-quality.ts`
- `src/lib/historical-cases.ts`
- `src/lib/proposal-diagnostics.ts`
- `src/lib/export-quality.ts`
- `src/components/AssistantActionPreview.tsx`
- `src/components/AssistantDiagnostics.tsx`
- `src/components/PostTripFeedback.tsx`
- `src/app/feedback/[tripId]/page.tsx`
- `src/app/api/feedback/route.ts`
- `src/app/api/catalog/quality/route.ts`

### Serviço Python

O planeador atual é `src/blu_ai/planner.py`; o contrato partilhado está em
`src/blu_ai/schemas/action-plan.json`. O template privado encontra-se em
`infra/assistant/template.yaml`. Os módulos LangGraph abaixo são legados e não
são a entrada do novo fluxo.

- `src/blu_ai/api/server.py`
  - Endpoints autenticados e contratos estruturados.

- `src/blu_ai/agents/curator_agent.py`
  - Planeamento de ações em vez de respostas livres.

- `src/blu_ai/agents/prompts.py`
  - Separação entre dados, regras e instruções.

- `src/blu_ai/schemas/itinerary.py`
  - Schemas de planos e ações.

- `src/blu_ai/tools/catalog_tools.py`
  - Deixar de pesquisar diretamente dados sem passar pela autoridade do portal.

- `src/blu_ai/tools/constraint_tools.py`
  - Remover duplicação ou transformar numa chamada à validação central.

- `src/blu_ai/config.py` e `src/blu_ai/llm.py`
  - IAM Role, configuração segura e falha explícita.

### Testes

- Testes dos schemas de ação.
- Testes de autorização e confirmação.
- Testes de grounding.
- Testes de prompt injection.
- Testes de itens inativos.
- Testes de feedback completo.
- Testes de alertas e tendências.
- Testes de preservação histórica.
- Testes de diagnóstico, alternativas e comandos compostos.
- Testes do modo de simulação e do resumo entre versões.
- Testes de controlo de qualidade antes da exportação.
- Testes da preparação de comunicações sem envio automático.
- Testes de falha explícita quando Bedrock está indisponível, sem fallback de modelo.
- Testes ponta a ponta: pedido → proposta → aprovação → versão.

---

## 9. Decisões recomendadas

1. **Manter a lógica de negócio no Next.js/TypeScript.**
2. **Usar o Bedrock para interpretar, planear, explicar e ordenar.**
3. **Nunca permitir escrita direta do agente na base de dados.**
4. **Exigir aprovação humana para alterações críticas.**
5. **Começar a Knowledge Base com SQL e pesquisa textual.**
6. **Adicionar embeddings apenas depois de medir necessidade.**
7. **Não realizar aprendizagem automática antes de existir feedback estruturado.**
8. **Usar as decisões dos trabalhadores como sinal auditável, sem autoajuste invisível.**
9. **Migrar a persistência para uma base central antes de utilização multiutilizador em produção.**
10. **Manter itinerários e PDFs históricos imutáveis.**

A primeira entrega deve abranger as **Fases 0 e 1**. Isso transforma o Blu num agente realmente útil sem comprometer catálogo, confirmações, versões ou supervisão humana. Todas as fases seguintes fazem parte do âmbito de implementação aprovado neste plano e devem manter a pré-visualização e a confirmação do trabalhador antes de alterar itinerários, catálogo, preços ou estados.
