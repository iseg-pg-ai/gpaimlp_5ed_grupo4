# Estado das funcionalidades

Estado verificado em 3 de outubro de 2026. Uma funcionalidade existente apenas num
branch ainda precisa de merge antes de ficar disponível em `main`.

## Implementado no branch documental atual

- Catálogo editável, estados de aprovação e histórico de revisões.
- Briefing por etapas e personalização estruturada.
- Geração com atividades, restaurantes e experiências elegíveis.
- Horários propostos para dados reconhecidos e deteção conservadora de conflitos.
- Edição e confirmação das atividades, com preenchimento do catálogo.
- Assistente para adicionar, substituir, reagendar, reorganizar e remover.
- Exportação em português e no idioma do cliente.
- Histórico imutável de versões e variantes linguísticas.
- Orçamento discriminado no PDF, com valores desconhecidos fora dos totais.
- Interface responsiva, navegação principal e gestão do catálogo.

## Disponível noutro branch

| Funcionalidade | Branch | Estado |
| --- | --- | --- |
| Redesenho visual das propostas PDF | `feat/proposal-delivery-versioning` | Implementado e testado; aguarda integração neste ramo. |

## Parcialmente implementado

- Horários e deslocações: formatos reconhecidos são tratados; condições ambíguas e
  percursos reais continuam a exigir revisão manual.
- Preços e orçamento: preços estruturados são calculados; impostos, tarifas
  infantis e horas faturáveis só são incluídos quando explícitos.
- Correção de erros: existe cobertura de regressão para as alterações realizadas,
  mas não uma garantia de ausência total de erros.
- Qualidade do código: lint, tipos e testes passam isoladamente nas alterações já
  validadas; `npm run format:check` ainda identifica ficheiros antigos que precisam
  de uniformização num branch de código dedicado.

## Por fazer

- Implementar a partilha pública das propostas.
- Retirar viagens dos planos ativos e enviá-las para o Lixo.
- Restaurar viagens e versões a partir do Lixo.
- Enviar versões individuais do histórico para o Lixo.
- Definir e implementar retenção ou eliminação automática no Lixo.
- Introduzir fotografias nos PDFs depois de existirem imagens com autorização e
  créditos documentados.
- Acrescentar autenticação, permissões e sincronização entre utilizadores.
- Substituir as margens estimadas por integração contratada de rotas, se aprovada.

## Limites que devem permanecer visíveis

- A geração cria propostas preliminares; não efetua reservas.
- Preços desconhecidos não representam zero.
- Horários propostos não representam confirmação do fornecedor.
- Dados históricos e textos livres são informação, não instruções executáveis.
- O orçamento disponível do cliente não representa o custo calculado da proposta.
