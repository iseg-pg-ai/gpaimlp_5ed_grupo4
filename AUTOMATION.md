# Automação e operações

## Fluxo local completo

Na raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

O script:

1. cria `.venv`, caso não exista;
2. instala as dependências fixadas em `requirements.txt`;
3. executa o ETL, a validação, os KPIs e os modelos analíticos;
4. exige `status: passed` em `warehouse/validation_report.json`;
5. compila os módulos Python e executa os testes de regressão do ETL.

Para ignorar a instalação num ambiente atualizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -SkipInstall
```

Para usar outros diretórios:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 `
  -DataDirectory data `
  -OutputDirectory warehouse
```

## Dashboard analítico

Depois de publicar o warehouse:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Abrir [http://localhost:8501](http://localhost:8501). Para escolher outra porta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1 -Port 8502
```

O dashboard lê os artefactos gerados e não edita as fontes.

## Integração contínua

O workflow `.github/workflows/data-pipeline.yml` é executado quando mudam dados,
ETL, dashboard, testes, dependências ou scripts. Valida o lock e os exports de
dependências, reconstrói o warehouse, executa a validação e os testes e publica o
artefacto `blu-warehouse`.

Não existe atualização agendada das fontes. Um agendamento só deve ser criado
depois de serem definidos a cadência, a origem e o processo de aprovação.

## Recuperação e resolução de problemas

- **`.venv` em falta:** executar o fluxo completo sem `-SkipInstall`.
- **Falha de instalação:** confirmar acesso à Internet e repetir a instalação.
- **Validação falhou:** consultar `warehouse/validation_report.json` e
  `warehouse/data_quality_issues.jsonl`, corrigir a fonte e repetir o ETL.
- **Dashboard sem warehouse:** executar primeiro a pipeline.
- **Portal sem catálogo aprovado:** rever o catálogo e voltar a publicar pelo ETL.
- **Tradução local indisponível:** instalar o grupo `translation` e executar
  `translations/setup_models.py`.

## Cópias de segurança

- Fazer backup de `exports/itineraries/` para preservar versões e PDFs.
- Fazer backup de `data/portal/catalog.sqlite` com o portal e o ETL parados.
- Não guardar segredos, credenciais ou ficheiros `.env` no Git.
- Não tratar `warehouse/` como fonte editável.

Consulte também [o contrato do ETL](README_ETL.md) e o
[guia do portal](docs/PORTAL.md).
