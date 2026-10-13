# Decisões

## 2026-10-13 — Arranque portátil no SageMaker

Estado: implementado e validado localmente.

O arranque preserva Node compatível, inicia o agente Python apenas com
`BLU_START_AGENT=1` e valida a origem HTTPS, porta, prefixo e build. Recusa uma
porta ocupada antes de recompilar para proteger o servidor já em execução.
O servidor usa a origem configurada nos redirecionamentos e resolve a pasta
do portal a partir do próprio script.

Evidência: `npm run check` passou (93 testes aprovados, um ignorado), build
AWS passou, testes `aws-config.test.mjs` passaram e conflito de porta foi
confirmado por execução. O teste de navegador está limitado por bibliotecas
Chromium ausentes. Sem os erros do colega, a causa na sua instância não foi
confirmada. Não foi efetuado push nem deployment.
