# Dataset estruturado complementar

`structured_dataset.xlsx` é uma cópia integral do ficheiro fornecido pelo
utilizador.

## Fluxo

Na raiz do repositório, a execução seguinte importa o Excel principal e este
complemento, quando presente:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

- As 15 folhas ficam preservadas em tabelas/JSONL `structured_*`, incluindo guias e auditorias.
- `Atracoes_base`, `Restaurantes_base`, `Experiencias_base` e `Precos_base`
  complementam as tabelas operacionais por chave exata. Só preenchem campos
  ausentes; chaves novas acrescentam registos.
- Valores existentes são preservados. Divergências ficam em
  `structured_merge_conflicts`; alterações em `structured_merge_changes`. Cada
  registo cruzado identifica ficheiro, folha e linha do complemento.
- IDs duplicados, chaves em falta e referências internas quebradas interrompem a
  importação antes de substituir os outputs.
- Roteiros, viajantes, menções de atividades e preços históricos permanecem separados. Não são disponibilidade, reservas ou tarifas atuais.
- `Regras_BLU` conserva a versão documental; as regras operacionais e os tiers mantêm a origem principal e os overrides aprovados em `config/curation_rule_overrides.json`.

## DMC Workspace

A API de itinerários lê o catálogo já enriquecido do warehouse. As atividades
mostram a fonte complementar nos detalhes. A página `/references` permite
consultar propostas históricas, menções, preços e divergências para revisão.

O `manifest.json` inclui o hash do complemento, contagens por folha e o balanço da
integração. O ficheiro Excel original não é modificado. O conteúdo dos guias é
tratado como dados, não como instruções de execução.
