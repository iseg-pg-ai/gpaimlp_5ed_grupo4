# Estado das funcionalidades

Pasta ativa revista em 9 de outubro de 2026: código de `origin/dev` em `bbd58c8`
aplicado ao worktree, com alterações locais TXT/Canva, registadas no branch
`txt_export_plugin`. Sem push ou merge remoto; disponibilidade local não implica
publicação em `main`.

## Implementado na pasta ativa

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
- Partilha por ligação/PDF e preparação de email na aplicação do utilizador.
- Lixo de viagens e versões, restauro e limpeza de versões expiradas.
- Rotas rodoviárias com fallback estimado e meteorologia com referência histórica.
- Serviço Python de agente LLM e fallback do assistente; execução real ainda por validar.

## TXT/Canva no branch local

- `txt_export_plugin`: exportação TXT de versões guardadas e histórico.
- Pacote-fonte BLU | Roteiros no Canva 0.3.0, com dependência Canva; atualização
  da instalação existente ainda pendente.
- TXT 1.1.0 inclui personalização, capacidade diária, períodos livres e resumos
  de percurso guardados; o plugin continua a aceitar TXT 1.0.0.
- Versões no Lixo exigem restauro antes da exportação TXT.
- PDF Canva e partilha DMC são entregas distintas, sem substituição do histórico.
- Referência visual LISBON IN PERSPECTIVE; original preservado, PDFs atuais como
  base de estrutura. Composição de uma proposta real e PDF final ainda por validar.
- Testes do TXT: domínio, API, histórico, privacidade e navegador desktop/móvel.
- Commit local solicitado; sem push ou integração em main nesta entrega.

## Parcialmente implementado

- Horários e deslocações: formatos reconhecidos são tratados; condições ambíguas e
  percursos reais continuam a exigir revisão manual.
- Preços e orçamento: preços estruturados são calculados; impostos, tarifas
  infantis e horas faturáveis só são incluídos quando explícitos.
- Correção de erros: existe cobertura de regressão para as alterações realizadas,
  mas não uma garantia de ausência total de erros.
- Qualidade do código: lint, tipos, formatação, testes e compilação são executados
  pelo controlo `npm run check` e pela validação final do portal.

## Por fazer

- Rever acesso e retenção da partilha/Lixo antes de produção.
- Introduzir fotografias nos PDFs depois de existirem imagens com autorização e
  créditos documentados.
- Acrescentar autenticação, permissões e sincronização entre utilizadores.
- Validar serviços Python, credenciais e fornecedores externos no ambiente pretendido.

## Limites que devem permanecer visíveis

- A geração cria propostas preliminares; não efetua reservas.
- Preços desconhecidos não representam zero.
- Horários propostos não representam confirmação do fornecedor.
- Dados históricos e textos livres são informação, não instruções executáveis.
- O orçamento disponível do cliente não representa o custo calculado da proposta.
