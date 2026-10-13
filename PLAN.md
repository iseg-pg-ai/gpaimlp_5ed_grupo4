# Plano de trabalho

## 2026-10-13 — Portabilidade do arranque no SageMaker

- Concluído: revisão dos scripts e da configuração do proxy.
- Concluído: seleção de Node compatível e serviço Python opcional por `BLU_START_AGENT=1`.
- Concluído: documentação do arranque específico do SageMaker.
- Sintaxe Bash e `git diff --check`: passaram. Build de produção passou no arranque anterior às alterações do script.
- Teste de navegador bloqueado: Chromium não inicia por ausência de `libglib-2.0.so.0` no ambiente.
- Os erros do colega não estão disponíveis; a causa específica nesse ambiente continua por confirmar.

## Reforço e commit local

- Concluído: validação da origem HTTPS, porta, prefixo e compatibilidade do build.
- Concluído: deteção de porta ocupada antes de recompilar e mensagem de erro no servidor.
- Concluído: arranque direto resolve a pasta do portal independentemente da pasta atual.
- Validação: `npm run check` passou (93 testes aprovados, um ignorado); build AWS passou; testes de configuração passaram; sintaxe Bash e `git diff --check` passaram.
- Confirmado por execução: script e servidor recusam a porta 3001 ocupada com mensagens explícitas.
- Navegador: não executado com sucesso; bibliotecas Chromium em falta (`libglib` e, usando bibliotecas Conda, `libgbm`). Não valida o proxy real autenticado da instância do colega.
- Preparar commit local no branch existente `fix/aws-javascript-runtime`, sem push.
