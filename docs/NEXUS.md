# NEXUS Integration Gateway v0.1

O NEXUS junta as ofertas dos canais de parceria da BLU num modelo comercial único e compara-as
para o mesmo produto: qual o canal que dá mais **lucro** ou mais **receita** (à escolha) e quanto
se perde por venda quando outro canal vende em vez do melhor (**canibalização**). Cada valor
mostra de onde veio (linhagem da fonte).

Âmbito da v0.1: pacote Python em `src/nexus/`, só biblioteca padrão, sem base de dados nem
catálogo paralelo. Não altera a intranet, o portal nem o ETL. Sem frontend nesta versão.

## Canais

| Canal | Exemplo | O que a BLU ganha |
| --- | --- | --- |
| `reseller` | GetYourGuide Partner API | comissão × o que o cliente paga; sem custo |
| `direct` | ficheiro de um fornecedor | preço ao cliente − custo |
| `own` | parceiro próprio da BLU | preço ao cliente − custo acordado |

## Modelo canónico

Uma **oferta** é uma forma de vender um produto BLU (`product_key`) por um canal. Contrato em
[`src/nexus/schemas/offer.schema.json`](../src/nexus/schemas/offer.schema.json); validação em
`src/nexus/model.py`. Regras:

- Campos desconhecidos, tipos errados, moedas que não são ISO 4217 e datas inválidas recusam o
  registo com o motivo. Decimais com ponto (`90.50`); vírgula é recusada, não convertida.
- Desconhecido é `null`, nunca zero: sem custo ou sem comissão, a margem fica desconhecida.
- A revenda não tem custo para a BLU (usa `commission_rate`); os canais direto e próprio não têm
  comissão.
- `price_basis`: `quoted` (preço cotado) ou `from` («a partir de», indicativo).
- `lineage`: fonte, tipo (`api` ou `file`), referência exata (caminho da API e posição, ou
  ficheiro e linha), contrato e versão, data de ingestão e SHA-256 do registo de origem.

## GetYourGuide Partner API

Adaptador em `src/nexus/adapters/getyourguide.py`, segundo o contrato
[getyourguide/partner-api-spec](https://github.com/getyourguide/partner-api-spec) 1.0.0
(Apache 2.0). Lê respostas guardadas de `GET /{version}/tours` e de
`POST /{version}/tours/{tour_id}/price-breakdown`.

- `retail_price` e `customer_base_price` são preços **ao cliente**; o contrato não diz o que a
  BLU ganha. A comissão vem do acordo de parceria, em `config/nexus.json`
  (`commission_rate`, `null` até haver acordo).
- Uma tour só entra num produto por mapeamento explícito (`product_mapping`, `tour_id` →
  `product_key`); as outras aparecem em `unmatched`.
- A moeda de `/tours` vem do pedido (`currency=` em `_metadata.query`); sem ela, a tour é
  recusada. O preço de `price-breakdown` é por pessoa: `retail_price` da categoria `adult` a
  dividir pela quantidade pedida.

## Ficheiros de fornecedores

`src/nexus/ingest.py`, CSV (`,` ou `;`) ou JSON, com exatamente estas colunas:
`supplier_id, supplier_name, product_key, title, channel, currency, unit, sell_price,
cost_price, min_pax, valid_from, valid_to`. Cada linha é validada sozinha; as recusadas saem
com `ficheiro#row=N` e o motivo. Revenda não entra por ficheiro, só pelo adaptador da API.

## Endpoint

```bash
PYTHONPATH=src python -m nexus.gateway --data <pasta> --config config/nexus.json
```

Pasta de dados (lida de novo em cada pedido):

```text
<pasta>/getyourguide/tours/*.json
<pasta>/getyourguide/price-breakdown/<tour_id>.json
<pasta>/suppliers/<source_id>/*.csv|*.json
```

`GET /v1/margins?objective=profit|revenue&pax=2&as_of=AAAA-MM-DD&product_key=…` devolve, por
produto e moeda (moedas nunca se misturam): as alternativas com o que o cliente paga, receita,
custo, lucro e margem; o melhor canal para o objetivo; a canibalização por venda; e, no fim, as
contagens por fonte, os registos recusados e as tours sem mapeamento. Parâmetros desconhecidos
dão `400`. Contrato em `GET /v1/openapi.json` ([`src/nexus/openapi.json`](../src/nexus/openapi.json));
`GET /health` para verificação.

## Testes

```bash
PYTHONPATH=src python -B -m unittest tests.test_nexus -v
```

Dados sintéticos em pastas temporárias; workflow `.github/workflows/nexus.yml` (Python 3.12 e
3.13).

## Autoria

- **Autora e responsável:** Inge ([giselainge](https://github.com/giselainge)), que definiu o
  produto, os requisitos e as decisões.
- **Proposta de desenho:** redigida com o ChatGPT (OpenAI), a partir das indicações da autora.
- **Implementação:** escrita com o Claude Code (Anthropic), sob a direção da autora.

## Pendências

- Comissão do acordo GetYourGuide e mapeamento das tours para produtos BLU.
- Cliente da API em direto (token e chamadas) em vez de respostas guardadas.
- Volumes de vendas por canal, para passar de perda por venda a perda total.
- Frontend: segue o fluxo de branches acordado quando a referência `inge/frontend` estiver
  reconciliada (o branch ainda não existe no repositório).
