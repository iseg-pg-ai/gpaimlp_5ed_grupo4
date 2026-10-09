# Plano de evolução do BLU AI System

Revisto em 2026-10-09 contra a integração local de dev, commit `bbd58c8`.
A pasta ativa foi atualizada; as alterações anteriores permanecem no backup.
Inclui a implementação local em `txt_export_plugin` e validação do portal.

## Integração de dev e revisão TXT/Canva - 2026-10-09

- [x] Aplicar os 82 ficheiros reconciliados na pasta ativa, com backup anterior.
- [x] Resolver conflitos mantendo TXT, partilha e Lixo.
- [x] Corrigir o estado da meteorologia e a adição assíncrona de atividades.
- [x] Evoluir TXT para 1.1.0, com personalização, capacidade, períodos livres e percursos.
- [x] Exigir restauro de versões no Lixo antes de exportar TXT.
- [x] Rever pacote-fonte do plugin para 0.3.0, compatível com TXT 1.0.0 e 1.1.0.
- [x] Distinguir PDF Canva, PDF histórico DMC e partilha integrada.
- [x] Validar check, build e navegador na pasta ativa atualizada.
- [ ] Atualizar a instalação do plugin após revisão do pacote local.

A integração foi aplicada ao worktree e passa a ser registada no branch
txt_export_plugin por pedido do utilizador. Sem push ou merge remoto.
O backup está na pasta irmã before-dev-application-20261009.

Validação em 2026-10-09: lint, tipos e formatação passaram; 96 testes do portal
e 18 testes Python passaram; build padrão Turbopack passou. Navegador validou TXT,
privacidade, versões históricas, Lixo/restauro e layouts 1440/390/320 px. O teste
de adição de atividades também passou, incluindo recusa sem fechar o modal.
Capturas em .tools/canva-smoke/; pacote revisto em
.tools/releases/blu-curadoria-0.3.0.zip. Não foram usadas credenciais de agentes
externos nem criada uma proposta real no Canva.

## Objetivo

Consolidar catálogo revisto -> briefing -> proposta explicável -> confirmação
humana -> versão imutável -> PDF português e variante linguística.
Evoluir entrega e operação antes de acrescentar fornecedores externos.

## Desenvolvimento existente

As tarefas assinaladas representam implementação inspecionada, não nova execução
de testes nesta revisão documental.

- [x] Ingestão Excel/PDF, linhagem e enriquecimento estruturado.
- [x] Warehouse validado e publicação atómica com rollback.
- [x] Streamlit analítico separado do portal operacional Next.js.
- [x] Briefing integrado; Google Forms fora do âmbito.
- [x] Catálogo editável com estados, revisões e histórico SQLite no checkout atual.
- [x] Integração do catálogo no ETL e geração com oferta aprovada no checkout atual.
- [x] Personalização estruturada e distribuição das categorias elegíveis.
- [x] Horários propostos e tratamento conservador de condições ambíguas.
- [x] Edição e confirmação manual com dados/evidência no checkout atual.
- [x] Assistente determinístico para alterações explícitas.
- [x] Versões imutáveis, concorrência, PDF/ZIP e tradução local opcional.
- [x] Orçamento discriminado com valores desconhecidos separados no checkout atual.
- [x] README, documentação operacional e CI documental reconciliados no checkout atual.
- [x] Reformulação do plano, instruções e memória pela implementação atual.

Ver [memory/product-scope.md](memory/product-scope.md) para evidência e limites.

## Prioridade 1 - Consolidar a base

- [x] Atualizar a pasta ativa com main, preservando a pasta anterior em backup.
- [x] Recuperar e atualizar AGENTS.md, PLAN.md e memory/ no checkout atual.
- [ ] Confirmar o destino dos próximos PRs face à política anterior de dev.
- [x] Adaptar as instruções centrais aos manifests e diretórios existentes.
- [ ] Rever docs/STATUS.md após integrações; commits revertidos não são capacidades.
- [ ] Validar o código integrado: Python, lint, tipos, formatação, domínio,
  armazenamento, build e cenários de navegador aplicáveis.
- [ ] Acrescentar CI do portal; CI de dados/documentação não cobre o frontend.
- [ ] Automatizar catálogo aprovado -> publicação -> briefing -> geração ->
  confirmação -> versão -> PDF -> reexportação dos mesmos bytes.
- [ ] Definir entrega do warehouse e gates/exceções auditáveis para erros PDF e
  conflitos estruturados.

Conclusão: código e documentação concordam, conflitos tratados estão resolvidos
e o fluxo local tem evidência de validação.

## Roteiro TXT e Canva

A intenção clarificada é exportar uma proposta concreta, não editar um prompt
genérico no dashboard. Não está prevista uma página /settings/prompt nesta entrega.

- [x] Exportar TXT da versão guardada, com instruções e JSON do roteiro.
- [x] Disponibilizar download no roteiro e no histórico, com idioma do cliente.
- [x] Preservar versões, moedas, pendências e estado de exportação PDF.
- [x] Excluir contactos, referências de reserva e notas internas do TXT.
- [x] Usar os PDFs como base de conteúdo e o modelo Canva LISBON IN PERSPECTIVE
  (`DAHDpPXVRsU`) como referência visual, sem alterar o original.
- [x] Criar o plugin privado BLU | Roteiros no Canva, versão 0.2.0, ligado ao Canva.
- [x] Validar domínio e download no navegador a 1440, 390 e 320 px.
- [ ] Validar uma proposta real: TXT -> cópia Canva -> revisão -> PDF final.

Instruções em config/prompts/roteiro-visual-canva.txt; pacote-fonte em
plugins/blu-curadoria/. O prompt genérico anterior permanece como apoio secundário.
O plugin não tem acesso automático ao portal: recebe o TXT anexado pelo utilizador.
Criação visual e exportação final dependem das ferramentas e permissões Canva.

## Prioridade 2 - Entrega e recuperação

- [ ] Definir partilha pública: versão, consentimento, acesso, revogação e dados excluídos.
- [x] Implementar envio de viagens para o Lixo e remoção dos planos ativos em dev.
- [x] Implementar recuperação de viagens e versões sem reescrever histórico em dev.
- [x] Implementar versões individuais e limpeza do Lixo em dev.
- [x] Identificar o renderer com capa/layout de proposta e testes de apresentação.
- [ ] Inspecionar visualmente os PDFs gerados nos idiomas suportados.
- [ ] Acrescentar fotografias com autorização e créditos.
- [ ] Testar backup/recuperação de catálogo, histórico e PDFs.

Conclusão: partilha e recuperação têm contratos, cenários de aceitação e
preservam versões imutáveis.

## Prioridade 3 - Operação multiutilizador

- [ ] Definir autenticação, papéis, permissões e sincronização.
- [ ] Definir consentimento, minimização, retenção e eliminação de dados pessoais.
- [ ] Validar concorrência para catálogo, rascunhos e versões.
- [ ] Definir deployment, segredos, logs sanitizados e recuperação operacional.
- [ ] Aprovar migração/publicação antes de executar alterações externas.

Conclusão: acesso e persistência têm testes de isolamento e recuperação.

## Prioridade 4 - Integrações externas

- [ ] Escolher cenário e primeiro fornecedor necessários ao produto.
- [ ] Definir interfaces neutras, evidência, validade, timeouts e falhas com mocks.
- [ ] Verificar disponibilidade, documentação, termos e custos atuais.
- [ ] Integrar rotas reais sem apresentar estimativas como medições.
- [ ] Definir S3, retenção, região e fallback antes de implementar.
- [ ] Decidir responsabilidade Bedrock/OpenAI e validar propostas estruturadas.
- [ ] Acrescentar meteorologia/POIs apenas para necessidades demonstradas.
- [ ] Preservar revisão humana, fontes e limites de custo.

Conclusão: cada integração tem contratos/falhas testados e chamadas reais
autorizadas que não contornam o curador.

## Validação e limites

Partilha e Lixo estão implementados na integração de dev, sem aprovação de produção.
Autenticação, cloud e reservas não estão concluídos. O assistente tem fallback
para um serviço LLM Python separado; a execução com credenciais reais não foi validada.

Usar comandos existentes no manifest do checkout, `git diff --check` e testes
proporcionais ao comportamento afetado. Documentação isolada não exige
reconstrução do warehouse nem chamadas reais a fornecedores.
