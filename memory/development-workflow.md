# Fluxo de desenvolvimento e Git

Revisto em 2026-10-09.

## Política

A decisão de equipa de 2026-09-29 usa dev como base de integração, branches curtos
por alteração coerente e PRs revistos. Dev é a referência integrada
nesta revisão. Confirmar destino do PR para a tarefa; merges observados em main
não revogam por si só a política anterior.

Preservar alterações existentes. Com conflitos, compreender primeiro a operação
pendente; não mudar de branch nem descartar/mover/esconder trabalho para limpar
artificialmente o worktree.

## Preparar

Consultar git status, operação em curso, commits e base pretendida.
O código da pasta ativa recebeu origin/dev em bbd58c8 e as alterações TXT/Canva
reconciliadas. O branch atual é txt_export_plugin, criado a partir de
feature/prompt-roteiro-canva. O commit solicitado regista os ficheiros integrados;
não incorpora os 20 commits de dev como histórico de merge. Sem push remoto.
As alterações anteriores foram preservadas em before-dev-application-20261009,
na pasta irmã; não existe merge pendente na pasta ativa.
Concluir conflitos autorizados antes de iniciar outra integração.

Quando a base estiver confirmada e o estado Git permitir:

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c feature/briefing-estruturado
```

Adaptar a outra base autorizada; continuar no branch da tarefa se já existir.

## Nomes e âmbito

- feature/catalogo-aprovado: funcionalidade.
- fix/conflito-versoes: correção.
- docs/estado-projeto: documentação.
- refactor/interface-fornecedores: estrutura sem mudança funcional.
- test/confirmacoes: cobertura.
- chore/ci-portal: manutenção.

Correções relacionadas ficam no mesmo PR; trabalho independente tem revisão
separada. Atualizar PLAN.md quando o âmbito mudar.

## Rever e validar

Usar AGENTS.md e scripts do manifest local. Inspecionar worktree e staged,
proteger fontes e excluir bases operacionais, exports, segredos e caches.

```powershell
git status --short
git diff --check
git diff
git diff --cached
```

Marcar conflito resolvido com git add de caminhos explícitos apenas após revisão.
Remover marcadores do ficheiro não resolve o índice.

Commit e publicação exigem autorização aplicável. Quando autorizados, usar paths
explícitos, commits focados e prefixos feat:, fix:, docs:, refactor:, test: ou chore:.

## Pull Request e conclusão

Descrever problema, comportamento final, validação e limitações. Confirmar base,
passar checks e obter revisão antes do merge. Não forçar push nem reescrever
branches partilhados sem coordenação.

Após merge autorizado, atualizar base com fast-forward. Eliminar branches apenas
quando pedido e depois de confirmar integração. Deployment/chamadas pagas não
decorrem automaticamente de uma edição de código.
