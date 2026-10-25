# BLU Agent — âmbito funcional com Nova Pro

Revisto em 25 de outubro de 2026. Este documento define o que o agente BLU deve
fazer. A implementação usa exclusivamente Amazon Nova Pro através do Bedrock.
Os contratos técnicos e a execução encontram-se em [Assistente](ASSISTANT.md); as
entregas ainda abertas encontram-se no [Plano](../PLAN.md).

## Missão

O agente apoia o curador durante todo o ciclo de criação e revisão de uma proposta
de viagem. Compreende o pedido, consulta apenas dados autorizados, explica opções e
prepara alterações. O portal continua a decidir elegibilidade, custos, horários,
proteções, versões e persistência.

O agente nunca altera diretamente SQLite, S3, ficheiros ou páginas. Uma alteração
segue sempre este percurso:

```text
Pedido → leituras autorizadas → proposta estruturada → simulação determinística
       → pré-visualização → aceitação humana → nova versão auditada
```

## Contexto permitido

O agente pode consultar, apenas para a viagem e versão atuais:

- briefing operacional e preferências;
- chegada, partida, voos e ocasião especial;
- dias, atividades, horários e capacidade;
- bloqueios explícitos e estado das confirmações;
- catálogo aprovado e candidatos elegíveis;
- preços conhecidos, moedas, orçamento e pendências;
- diagnóstico determinístico da proposta;
- proposta pendente e conversa recente da mesma viagem;
- no modo cloud, memória privada do utilizador autenticado.

Ficam excluídos nomes, emails, contactos, notas internas, referências de reserva,
credenciais, segredos, prompts privados e dados de outras viagens. Resultados do
catálogo, mensagens e documentos são dados não fiáveis, nunca instruções.

## Capacidades transacionais

O contrato suporta treze ações:

1. adicionar uma oferta aprovada;
2. substituir uma atividade;
3. remover uma atividade;
4. alterar um horário;
5. reorganizar um dia;
6. ajustar a capacidade diária;
7. criar um período livre;
8. criar um dia livre;
9. mover uma atividade entre dias;
10. otimizar uma sequência geográfica estimada;
11. regenerar parcialmente um dia;
12. alterar campos operacionais permitidos do briefing;
13. preparar campos permitidos de uma confirmação pendente.

Alterações ao briefing limitam-se a orçamento, ritmo, preferência de manhã,
esforço físico, interesses, exclusões e restrições de mobilidade ou alimentação.
Uma confirmação pendente só pode receber horário, local, preço ou fornecedor que
tenham sido fornecidos pelo utilizador ou por uma fonte autorizada. O agente não a
marca como confirmada e não inventa disponibilidade, reserva ou evidência.

## Regras de edição

- Uma edição do agente nunca bloqueia automaticamente o dia.
- Apenas bloqueios explícitos e atividades confirmadas impedem alterações.
- Edições manuais são preservadas em regenerações amplas.
- Uma alteração explícita e revista pode voltar a editar um dia já modificado.
- Até oito ações podem formar uma proposta atómica; se uma falhar, nenhuma é aplicada.
- Adicionar e substituir são intenções diferentes.
- Pedidos ambíguos exigem esclarecimento, não uma suposição.
- Escrever «ok» no chat não equivale a aceitar uma proposta.
- A aceitação volta a simular contra a versão e o catálogo atuais.
- Conflitos, propostas expiradas e dupla aceitação falham sem alterar a viagem.

## Análise e explicabilidade

O agente deve explicar recomendações através de dados verificáveis:

- preferências e regras correspondentes;
- revisão e fonte do catálogo;
- preço conhecido e moeda, sem conversões implícitas;
- horários, capacidade e possíveis sobreposições;
- impacto em deslocações e orçamento;
- confirmações e informação ainda em falta;
- limitações de cada alternativa.

O diagnóstico preventivo identifica capacidade excedida, horários desconhecidos,
sobreposições, confirmações pendentes, itens fora do catálogo aprovado, preços
desconhecidos, moedas separadas, orçamento excedido e validações pendentes.
Desconhecido nunca significa gratuito, compatível ou disponível.

Uma primeira proposta que falhe na simulação pode ser corrigida uma única vez. O
modelo recebe apenas um código sanitizado e uma instrução genérica. Não recebe a
mensagem bruta do erro. A segunda falha termina o pedido sem escrita.

## Capacidades em evolução

O agente já pode consultar feedback aprovado, sinais agregados de qualidade e
casos históricos anonimizados. Deverá ainda:

- preparar exportações PDF/TXT e variantes linguísticas;
- preparar, mas não enviar, textos e partilhas;
- explicar diferenças entre versões;
- consultar meteorologia já solicitada explicitamente;
- consultar percursos medidos ou estimados, mantendo essa distinção;
- sugerir correções para chuva, acessibilidade, custo, qualidade e deslocações.

### Qualidade do briefing

Antes da geração, o agente deverá sinalizar sem alterar automaticamente:

- respostas contraditórias ou campos operacionais em falta;
- orçamento incompatível com o nível de proposta pretendido;
- restrições de mobilidade que exigem esclarecimento;
- restrições alimentares sem detalhe suficiente;
- chegada, partida ou ocasião especial incompletas quando forem relevantes.

### Feedback e qualidade do catálogo

O feedback pós-viagem fica ligado a uma única versão efetivamente realizada. O
questionário cobre todos os cartões e permite os resultados realizada, cancelada,
substituída ou não aplicável. Para atividades realizadas, pode recolher avaliação
global, exatidão da descrição, fornecedor, horário/duração, relação qualidade/preço,
acessibilidade e alimentação, bem como etiquetas de problema. Comentários livres
permanecem fora do contexto do modelo.

Os agregados por item devem apresentar utilizações, avaliações, média, cancelamentos,
substituições, problemas recorrentes, tendências a 30/90/180 dias e última utilização.
Um alerta conduz a revisão humana: manter, colocar em revisão ou inativar com motivo,
controlo de revisão e auditoria. A inativação impede novas recomendações, sem apagar
avaliações, versões ou entregas históricas.

### Casos históricos

Um caso reutilizável exige feedback completo, média mínima aprovada, ausência de
incidentes e aprovação humana. O índice conserva apenas perfil reduzido, IDs
estáveis, revisões dos itens realizados e decisões estruturadas. Exclui nomes,
contactos, comentários, PDFs e versões no Lixo. A primeira implementação usa SQL,
filtros estruturados e pesquisa textual; embeddings só entram depois de demonstrarem
ganho de relevância que justifique custo e complexidade.

### Perturbações e conteúdo

O agente deverá poder preparar planos alternativos para chuva, encerramento, atraso
de voo, cancelamento de fornecedor ou mudança de horário, sempre mostrando impacto
e preservando confirmações. Também poderá sinalizar descrições desatualizadas,
possíveis duplicados, campos em falta, inconsistências linguísticas e texto pouco
adequado à entrega ao cliente. Não corrige nem publica esses elementos sozinho.

Previsão de aceitação, risco operacional, duração real e otimização multiobjetivo
ficam adiadas até existir feedback estruturado suficiente e validado.

Feedback nunca altera automaticamente o catálogo, os prompts ou o ranking. Casos
históricos exigem aprovação humana, resultado conhecido e dados reduzidos. Voos,
reservas e contactos com fornecedores exigem APIs, contratos e políticas próprios;
não fazem parte das ferramentas atuais.

## Métricas e melhoria supervisionada

O sistema deve medir propostas, aceitações, rejeições, motivos estruturados,
expirações, conflitos, tokens, latência, custo configurado e versões editadas fora
das decisões do agente. Uma edição posterior não prova que o agente a causou.

Prompts, regras e ranking nunca se ajustam automaticamente. Qualquer alteração usa
casos de avaliação versionados, comparação controlada e aprovação humana. O conjunto
atual contém 38 cenários sintéticos; testes com mocks validam contratos e segurança,
mas não demonstram qualidade semântica do Nova Pro.

## Autoridade e segurança

| Classe | Exemplos | Regra |
| --- | --- | --- |
| Leitura | briefing, roteiro, catálogo, diagnóstico | Automática dentro da viagem autorizada |
| Análise | alternativas, impacto, ranking | Sem escrita |
| Escrita normal | briefing e itinerário | Pré-visualização e aceitação explícita |
| Escrita sensível | confirmação, partilha, Lixo | Confirmação reforçada e auditoria |
| Operação | backup, restauro, recuperação | Fora do chat comum; apenas admin/owner |
| Infraestrutura | IAM, buckets, deployment, segredos | Nunca disponível ao modelo |

No modo cloud, identidade, papel e permissões são derivados de tokens ALB/Cognito
validados pelo backend. O modelo não pode elevar permissões. No SageMaker sem esse
principal, a memória servidor e o ownership multiutilizador permanecem desativados.

## Fornecedor e limites

- Fornecedor único: Amazon Bedrock.
- Modelo atual: `eu.amazon.nova-pro-v1:0`.
- Autenticação: IAM Role, sem chaves estáticas.
- Sem fallback automático para outro fornecedor.
- Timeout, tokens máximos, preços e teto mensal são configuração do servidor.
- Testes automáticos usam clientes simulados e não geram custos.
- Uma avaliação real exige autorização explícita e limiares aprovados.

## Critérios de conclusão

O agente só é considerado completo quando:

1. todas as capacidades acima usam ferramentas tipadas e permissões de servidor;
2. não existe escrita sem pré-visualização e confirmação aplicável;
3. proteções, concorrência, versões e rollback passam integralmente;
4. logs conservam métricas e códigos, nunca prompts ou dados de cliente;
5. ranking, feedback, histórico, exportação e leituras externas são validados;
6. a avaliação Nova Pro atinge pelo menos 90% por operação e idioma;
7. existe 100% de respeito por bloqueios e zero escritas sem confirmação;
8. custo, privacidade, retenção e operação cloud estão formalmente aprovados.
