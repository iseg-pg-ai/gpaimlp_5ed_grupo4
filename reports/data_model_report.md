# Modelo de dados do warehouse BLU

## Abordagem

O warehouse usa um modelo analítico pragmático. Cada folha das fontes representa
uma entidade de negócio; o corpus de PDFs é representado pela relação entre
documentos e páginas. Os ficheiros JSONL preservam entregas portáteis por registo e
o SQLite fornece a camada de consulta usada pelo dashboard.

| Entidade | Grão | Chave de negócio | Finalidade |
| --- | --- | --- | --- |
| `atracoes` | Uma atração | `id` | Locais selecionáveis para itinerários. |
| `restaurantes` | Um restaurante | `id_blu` | Oferta de restauração e notas operacionais. |
| `experiencias` | Uma experiência | `nome_da_experiencia` | Experiências e fornecedores. |
| `precos` | Uma referência de preço | `id` | Catálogo de preços de referência. |
| `curation_principles` | Um princípio | `id` | Princípios gerais de decisão. |
| `curation_rules` | Uma regra operacional | `id` | Regras usadas na curadoria dos itinerários. |
| `data_request` | Uma definição solicitada | Linha da fonte | Requisitos de governação; os nomes podem repetir-se. |
| `proposal_documents` | Uma instância de PDF | `document_id` | Metadados, texto e facetas da proposta. |
| `proposal_pages` | Uma página de PDF | `(document_id, page_number)` | Texto pesquisável e rastreabilidade da página. |

## Relações e linhagem

`proposal_documents` tem uma relação de um para muitos com `proposal_pages` por
`document_id`. Cada registo de uma folha mantém `_source_sheet` e `_source_row`.
Cada PDF mantém `source_file` e cada página mantém `page_number`. O ETL valida que
não existem páginas órfãs.

O identificador do documento representa uma instância do ficheiro fornecido. O
`content_sha256` permite detetar conteúdo duplicado sem fundir ficheiros entregues
separadamente.

## Camada analítica

São publicados dois modelos explicáveis:

1. `model_catalog_readiness` calcula a percentagem de campos necessários à
   curadoria que estão preenchidos em cada atração, restaurante e experiência.
2. `model_proposal_complexity` estima o esforço de processamento da proposta com
   45% do número de páginas, 45% do volume de texto extraído e 10% da densidade de
   referências a preços.

Os scores são normalizados dentro do corpus atual. Não são modelos preditivos: as
fontes não incluem uma variável de resultado observada, como conversão, receita,
satisfação ou aceitação do itinerário.

## Qualidade dos dados

A validação estrutural verifica chaves obrigatórias e únicas, intervalos válidos de
coordenadas e a relação entre documentos e páginas. O relatório de validação também
mantém a completude dos campos opcionais para orientar o enriquecimento de atributos
geográficos, operacionais e comerciais.

Consulte o [contrato do ETL](../README_ETL.md) para os artefactos publicados e as
regras de substituição do warehouse.
