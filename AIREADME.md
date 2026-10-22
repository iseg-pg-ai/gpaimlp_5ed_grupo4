# Trabalhar no projeto BLU

O BLU combina fontes locais, um warehouse validado, um observatório analítico e
um portal para preparar itinerários e exportar propostas com histórico.

## Como o trabalho é conduzido

O agente principal coordena o âmbito, os ficheiros e as verificações. Subagentes
podem trabalhar em áreas independentes; cada ficheiro tem um responsável de
escrita de cada vez e as alterações são revistas em conjunto antes da entrega.

O trabalho começa por inspecionar o estado atual e reproduzir o problema.
Depois aplica uma correção delimitada e verifica os cenários afetados. Resultados
de testes simulados, execução local e serviços reais são apresentados separadamente.

## Documentos que orientam o trabalho

- [AGENTS.md](AGENTS.md) e instruções das subpastas: regras aplicáveis à execução.
- [PLAN.md](PLAN.md): tarefas e evidências atuais; não é uma autorização para publicar.
- [Decisões](docs/DECISIONS.md): razões e limitações duráveis.
- [README](README.md): preparação e comandos descobertos no projeto.
- [Testes](docs/TESTING.md): verificações e condições de execução.

Este documento explica o processo ao proprietário; não substitui esses contratos.

## Dados, resultados e revisão

Preservar os ficheiros de origem em `data/`. O ETL gere `warehouse/`; o portal
guarda versões e PDFs em `exports/itineraries/` ou `BLU_EXPORT_DIR`. Testes usam
cópias das fontes e armazenamento temporário separado. Não guardar segredos,
propostas de clientes ou caches no Git ou nos relatórios.

O piloto planeado é individual, privado no SageMaker e com edição apenas do
itinerário. A integração transacional e a avaliação real do modelo são fases
posteriores à preparação da base. O acesso AWS e a tradução nos seis idiomas
não ficam comprovados por instalar dependências ou passar testes com mocks.

As fases terminam com resultados, limitações e decisão do proprietário. Alterar
o âmbito, integrar a fase seguinte, fazer commit/push/merge ou disponibilizar na
AWS exige autorização aplicável. A aprovação de uma fase permite concluir as
ações técnicas reversíveis necessárias dentro desse âmbito.

Exemplo de pedido: «Corrige o problema identificado no diagnóstico, preserva os
dados e apresenta as alterações e os testes antes de avançar para a fase seguinte.»

## Assistente de itinerário — Fase 2

O fluxo de propostas com aceitação explícita, configuração privada e limites
está em [docs/ASSISTANT.md](docs/ASSISTANT.md). A exportação TXT mantém o
contrato atual para o Canva. Testes com fornecedor simulado não substituem
a avaliação real aprovada numa fase posterior.
