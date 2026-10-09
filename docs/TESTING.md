# Testes de conformidade e regressão

O comando integrado pressupõe o portal em execução na porta 3001:

```powershell
cd dmc-workspace
npm run dev -- -p 3001
npm run test:compliance
```

Use `PORTAL_URL` para testar outra origem e `BROWSER_CHANNEL` para escolher o
browser instalado.

| Requisito | Cobertura principal |
| --- | --- |
| Categorias, horários, preços e curadoria | `curation`, `scheduling`, `catalog-matching`, `proposal-budget` |
| Edição, confirmações e assistente | `activity-confirmation`, `assistant-editing`, browser `confirmations` e `assistant` |
| Adição compatível e deslocações | browser `eligible-addition`, `road-routing` |
| Seis idiomas | browser `catalog`, `navigation`, `responsive`; `pdf-presentation` |
| Computador, tablet e telemóvel | browser `responsive` e `briefing` |
| PDFs e orçamento | `pdf-presentation`, `proposal-budget`, `versions` |
| Partilha, versão e idioma | browser `delivery`, `versions` |
| Preservação e recuperação | `versions`, browser `workspace-recovery` |
| Remoção, restauro e datas-limite | `trip-trash`, `versions`, browser `trash` |
| Catálogo e ETL | `catalog`, `catalog-etl`, browser `catalog` |

O executor interrompe no primeiro erro e só apresenta sucesso depois de passar
qualidade, tipos, testes unitários, ETL, build de produção e todos os fluxos de
browser.
