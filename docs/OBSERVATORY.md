# Observatório de dados BLU

O dashboard consulta a entrega ETL em modo só de leitura. Localizações, unidades, confirmação e validade seguem o contrato versionado em [observatory.json](../config/observatory.json), implementado em [observatory.py](../etl/observatory.py). Não existe outro catálogo nem escrita a partir do dashboard.

## Interfaces que consomem o contrato

O Streamlit original e o Observatório nativo do portal consultam a entrega publicada. A aplicação Streamlit tem [guia próprio](../dashboard/README.md); a utilização da vista nativa pertence ao [Portal](PORTAL.md#catálogo).
Este documento concentra o contrato de dados partilhado, não a instalação ou uma contagem atual de ofertas.

## Localizações e unidades

A localização original é preservada. O destino é determinado por vocabulário controlado, aliases explícitos ou segmentos completos separados por vírgula, ponto e vírgula, barra ou travessão. Não há pesquisa por substrings, aproximação fonética ou geocodificação externa. «Lisboa / Porto» permanece ambíguo; «Hotel Lisboa» não é convertido em Lisboa. Regiões como Douro e Região de Aveiro mantêm o âmbito regional e não são contabilizadas como cidades.

Aliases como «Azóia (Sintra)» agregam a oferta no destino Sintra; não apagam a localidade de origem nem demonstram equivalência administrativa. «Vila Nogueira de Azeitão» é agrupada no destino Azeitão. A atribuição de uma localização não constitui confirmação de coordenadas, disponibilidade ou qualidade.

As unidades têm aliases explícitos. «Por pessoa» e «por pessoa; 1h30» têm a base `pessoa`, mas as condições originais continuam separadas na comparação de preços. `pessoa / atividade` é uma unidade distinta. «Compartilhada» ou «Grupo de 8 a 16 pessoas» descrevem modalidades/participantes e não demonstram uma unidade de cobrança. Unidades desconhecidas não recebem uma mediana comparativa.

Para rever o vocabulário, alterar o contrato, incrementar `version`, acrescentar um caso de teste e publicar uma nova entrega pelo ETL. Os valores originais não são substituídos. O relatório analítico regista a versão e o SHA-256 das regras.

## Confirmação comercial e validade por campo

A confirmação deve ser fornecida na origem com o campo a que se refere. As colunas opcionais abaixo são aceites nas folhas de catálogo ou bases do suplemento estruturado já consumidas pelo ETL. Usam os nomes normalizados das colunas, sem criar um ficheiro operacional ou persistência adicionais.

Para cada campo `campo`:

| Coluna | Contrato |
| --- | --- |
| `campo_confirmacao` | `confirmado`, `estimado`, `pendente` ou `contestado`; ausência significa `pendente`. |
| `campo_verificado_em` | Data ISO `AAAA-MM-DD` ou timestamp ISO da verificação; não pode estar no futuro. |
| `campo_valido_desde` | Primeiro dia da validade, inclusive; não é inferido. |
| `campo_valido_ate` | Último dia da validade, inclusive; não é inferido. |
| `campo_fonte_confirmacao` | Referência que suporta a confirmação desse valor. |
| `campo_valor_confirmado` | O valor exato confirmado, para invalidar evidência quando o campo mudar. |

Exemplo para o preço numérico `preco_referencia_eur` na folha de preços:

| Coluna | Exemplo sintético |
| --- | --- |
| `preco_referencia_eur` | `25` |
| `preco_referencia_eur_confirmacao` | `confirmado` |
| `preco_referencia_eur_verificado_em` | `2026-10-01` |
| `preco_referencia_eur_valido_desde` | `2026-10-01` |
| `preco_referencia_eur_valido_ate` | `2026-10-31` |
| `preco_referencia_eur_fonte_confirmacao` | `Referência de confirmação do fornecedor` |
| `preco_referencia_eur_valor_confirmado` | `25` |

Não inserir este exemplo nos dados reais. A confirmação exige fonte, data e correspondência exata com o valor. Nos preços numéricos, valores equivalentes como `5` e `5.0` conservam a confirmação entre Excel e SQLite; zero explícito pode ser confirmado, mas uma ausência nunca é convertida em zero.

As confirmações incompletas ficam pendentes, conservando o estado declarado.
Uma janela temporal requer ambos os limites; sem eles o prazo é desconhecido.
Datas inválidas, cronologia invertida ou verificação futura impedem a publicação.
Uma data de pesquisa, o preenchimento do campo, a aprovação de um registo no portal ou `_pricing.status` não substituem este conjunto de evidências.

Morada (`morada`) e contactos públicos (`contactos`) são avaliados em todas as entidades, além dos campos abaixo.

Campos avaliados:

| Entidade | Campos de origem |
| --- | --- |
| Atrações | `tempo_medio_de_visita`, `horario`, `preco_da_atracao`, `necessidade_de_reserva`, `acessibilidade_nivel_de_confirmacao` |
| Restaurantes | `duracao_blu_estimativa`, `horario_base_reconfirmar`, `preco_nao_cotacao`, `reservas_condicoes_base`, `acessibilidade_nivel_de_confirmacao` |
| Experiências | `duracao`, `horario`, `preco`, `modalidade`, `acessibilidade_nivel_de_confirmacao` |
| Referências de preço | `preco_referencia_eur` |

O dashboard reavalia os prazos à data UTC da consulta, mesmo numa entrega antiga.
«Evidência vigente» exige confirmação completa e uma janela que contenha a data atual; não significa disponibilidade, reserva, aprovação do catálogo ou preço de venda autorizado. A republicação não prolonga prazos. Uma edição do valor pelo portal invalida a correspondência com uma confirmação antiga.

## Entrega e compatibilidade

O ETL publica `model_observatory_catalog`, `model_observatory_prices` e `model_field_evidence` em JSONL e SQLite. Evidências inválidas interrompem a construção antes da publicação; mantém-se o rollback existente.

Em entregas anteriores sem estas tabelas, o dashboard aplica o mesmo módulo ETL em memória a um snapshot SQLite só de leitura. Não altera o warehouse e não lê alterações ainda não publicadas do catálogo operacional. O estado temporal é reavaliado em ambas as situações.

## Fotografias

O painel Destinos inclui fotografias locais de Lisboa e Porto. São imagens de enquadramento histórico do destino, não fotografias certificadas das atividades.
A ausência de uma fotografia para outros destinos é preservada.

Licença, autoria, origem, data de obtenção, alterações e SHA-256 constam de [photos.json](../dashboard/assets/photos.json). O dashboard verifica a licença, os créditos e os bytes antes de apresentar a imagem. Sem downloads ou pedidos a fornecedores no navegador; os links de origem abrem apenas por ação do utilizador.

- Lisboa: [A Lisbon view, CrisLuiz](https://commons.wikimedia.org/wiki/File:A_Lisbon_view.jpg), CC0 1.0.
- Porto: [Night cityscape of Porto, Dimitry Anikin](https://commons.wikimedia.org/wiki/File:Night_cityscape_of_Porto,_Portugal._(52552329452).jpg), CC0 1.0.

Os ficheiros locais são miniaturas do Commons, sem outras alterações. O recorte visual no cartão não modifica os originais. Novas fotografias exigem origem, autoria, licença compatível e atualização dos hashes e testes; não associar uma imagem de destino a uma atividade específica por aproximação.

## Validação

```bash
PYTHONPATH=src .venv/bin/python -B -m unittest tests.test_observatory tests.test_dashboard -v
```

Os testes completos incluem a construção de uma entrega temporária e os modelos publicados. Fotografias e testes de interface requerem o grupo `dashboard`; os contratos ETL não dependem de Streamlit nem de serviços AWS.

## Enriquecimento por revisão do catálogo

O `sourceData.fieldEvidence` do contrato existente do catálogo conserva os metadados por nome de campo. A gravação normal mantém essa evidência; o ETL exporta os sufixos reconhecidos e revalida datas e correspondência com o valor. `etl.enrichment.apply_verified` preenche apenas lacunas de registos aprovados, exige prova para cada valor e cria novas revisões numa transação. Não altera preços estruturados existentes, identidades, estados ou perfis de compatibilidade.

`sourceData.priceReferences` permite completar preços numéricos de uma atração com ID e nome exatos, valores, condições e evidência explícita. Só revisões aprovadas podem fornecer esses dados ao ETL; referências ou valores já preenchidos não são substituídos. A origem permanece no catálogo operacional, sem reescrever o Excel ou introduzir persistência adicional.

Ver [a fundamentação dos critérios de enriquecimento](DECISIONS.md#fontes-qualidade-e-publicação-do-warehouse).
