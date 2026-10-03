# Documentação do projeto

## Guias principais

| Documento | Finalidade |
| --- | --- |
| [README principal](../README.md) | Visão geral, requisitos, instalação e arranque rápido. |
| [DMC Workspace](PORTAL.md) | Utilização do portal, arquitetura, exportação e testes. |
| [Estado das funcionalidades](STATUS.md) | Funcionalidades integradas, disponíveis em branches e pendentes. |
| [ETL](../README_ETL.md) | Contrato de entrada, transformação, validação e outputs. |
| [Automação](../AUTOMATION.md) | Execução completa, CI e resolução de problemas. |
| [Modelo de dados](../reports/data_model_report.md) | Entidades, relações, linhagem e modelos analíticos. |

## Fontes específicas

- [Dataset estruturado complementar](../data/reference/README.md)
- [Catálogo editável local](../data/portal/README.md)

`dmc-workspace/AGENTS.md` e `dmc-workspace/CLAUDE.md` contêm instruções para
ferramentas de desenvolvimento. Não fazem parte da documentação funcional do
produto e não devem ser usados como guia de instalação.

## Convenções

- Usar português europeu na documentação funcional.
- Usar **itinerário** para a sequência diária e **proposta** para a versão entregue
  ao cliente. **Roteiro** só é mantido quando aparece na interface ou em dados
  históricos.
- Usar **atividade**, **restaurante** e **experiência** para as categorias do
  catálogo.
- Escrever os níveis como **Soft**, **Classic** e **Signature**.
- Indicar o diretório de execução antes de cada comando.
- Identificar explicitamente funcionalidades simuladas, locais ou ainda não
  integradas.
