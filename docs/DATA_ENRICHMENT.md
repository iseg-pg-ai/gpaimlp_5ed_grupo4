# Preenchimento verificado — 2026-10-16

Estado revisto em 2026-10-24. As lacunas abaixo são aceites como dados
desconhecidos até existir uma fonte inequívoca ou validação comercial. Não
bloqueiam o ETL, mas bloqueiam qualquer afirmação automática de preço,
disponibilidade ou compatibilidade que dependa desses campos.

Foram preenchidos **45 valores em 13 registos do catálogo** e **três valores
numéricos numa referência de preços**. O ETL publicou a entrega enriquecida.
Não foram alterados os Excel/PDF originais, os identificadores, as revisões
anteriores, restrições ou preços comerciais já preenchidos.

## Dados acrescentados

| Oferta | Preenchimentos |
| --- | --- |
| Nat’elier — masterclass | Morada, contacto da atividade e condições de reserva. |
| Fragulho — Casa dos Lagares | Morada, contactos e antecedência de reserva; contacto do fornecedor na experiência com Quinta dos Azeredos. |
| COSTA NOVA — fábrica e outlet | Local da visita fabril, contactos, duração, horário, tarifa pública, acessibilidade parcial, coordenadas e condições de reserva. |
| Vista Alegre — fábrica de Ílhavo | Morada, contactos e coordenadas do complexo fabril correto. |
| José Maria da Fonseca — cinco experiências | Contactos; duração, preço público e horário nas provas identificadas; duração do Wine Blending e condições de marcação das provas. |
| Fado in Chiado | Morada, contactos e sessões com distinção sazonal. |
| Clube de Fado | Morada, telefone e horário de abertura/espetáculo. |
| Jardim Botânico de Lisboa | Contacto e referência de bilhete regular/adulto de 5 EUR, sénior de 4 EUR, com condições oficiais. |

Os valores e as provas exatas pertencem às revisões do catálogo operacional
materializado a partir da release ativa no S3. A entrega mantém a correspondência
de ID e revisão. Os contactos são públicos de fornecedores, não dados pessoais
de viajantes.

## Fontes oficiais consultadas

- [Nat’elier — masterclass](https://natelier.pt/masterclass/).
- [Fragulho — contactos](https://fragulho.pt/pt/contacts/) e [condições de visita](https://fragulho.pt/pt/experiences/).
- [COSTA NOVA — visita fabril](https://costanovaindustria.com/en/about-factory-experience/) e [contactos](https://costanovaindustria.com/en/contacts/).
- [Vista Alegre — informações e GPS de Ílhavo](https://br.vistaalegre.com/institucional/museu/informacoes-gerais).
- [José Maria da Fonseca — catálogo de enoturismo 2026](https://www.jmf.pt/img/enoturismo/jmf/Enoturismo_Casa%20Museu_Visitas%20e%20Provas_2026%20PT.pdf).
- [Fado in Chiado](https://fadoinchiado.com/).
- [Clube de Fado](https://www.clubedefado.pt/).
- [Museus ULisboa — preçário 2026](https://museus.ulisboa.pt/sites/default/files/inline-images/Pre%C3%A7ario_2026.jpg) e [contacto das visitas ao Jardim Botânico](https://www.ulisboa.pt/evento/visitas-ao-jardim-botanico-com-jardineirs-0).

## Preservação e rastreabilidade

O lote histórico foi primeiro aplicado a uma cópia e validado pelo ETL. A
aplicação criou novas revisões numa transação e as revisões anteriores foram
comparadas byte a byte. Os artefactos locais usados nessa intervenção não são
uma fonte de verdade nem fazem parte da instalação atual. Não repetir o lote:
qualquer correção nova deve criar uma revisão normal no catálogo operacional e
ser publicada pelo fluxo S3 documentado.

O campo contratual existente `sourceData` guarda a evidência por campo e as
referências de preço. O ETL só preenche referências preexistentes com ID e nome
exatos, quando a revisão do catálogo está aprovada e o valor de origem está
vazio. Não substitui um valor conhecido por um preço diferente. As alterações
derivadas ficam em `verified_enrichment_changes` no warehouse.

A validade até 31/12/2026 explicitada pela José Maria da Fonseca foi aplicada
apenas aos preços, sem inventar prazos para contactos, horários ou durações.
A data de verificação é 2026-10-16. Não foi inferido um início de validade que a
fonte não declara. A confirmação de um dado público não equivale a disponibilidade
para uma viagem, reserva ou tarifa BLU negociada.

## O que continua por confirmar

- O «Restaurante Alcobaça» não tem identificação suficiente para atribuir morada
  ou coordenadas sem risco de escolher outro estabelecimento.
- Mantêm-se em falta preços por proposta, suplementos sem tarifa publicada e
  descontos que não constam da fonte. Não foi atribuído zero a esses campos.
- A gratuitidade infantil do Jardim Botânico tem condições de idade; não foi
  convertida em `crianca_eur = 0` para todas as crianças.
- A página anteriormente associada à Vista Alegre remete para a fábrica Atlantis
  em Alcobaça. Os dados de Ílhavo vieram da fonte correta; não foram reutilizados
  o preço ou a duração de uma visita a outra fábrica.
- O catálogo JMF apresenta Wine Blending com condições diferentes da modalidade
  comercial anterior da BLU. Foi mantido o preço comercial existente; a duração
  oficial foi acrescentada, sem alterar as restrições ou considerar a modalidade
  comercial revalidada.
- O preço público atual do Clube de Fado não foi usado para substituir a tarifa
  comercial BLU já registada: são naturezas comerciais distintas.
- Não foram inferidas datas, número de viajantes ou preços atuais a partir de
  propostas históricas.

Estas exceções são uma decisão conservadora, não tarefas de preenchimento
automático. São revistas quando surge evidência nova; até lá, a interface deve
mostrar «por confirmar» e exigir revisão humana. Conflitos estruturados que
afetem uma release são tratados separadamente pelo gate
`scripts/check_warehouse_release.py`; qualquer exceção exige responsável,
justificação, data de expiração e correspondência exata com o conflito.

O dashboard apresenta condições verificadas e distingue estado de origem de
confirmação por campo. Para preços e validade, consultar o
[contrato do Observatório](OBSERVATORY.md).

## Validação da entrega

ETL publicado com `status: passed` e zero ocorrências de integridade. As 13
revisões correntes foram cruzadas com o warehouse; todos os snapshots anteriores
foram preservados. Bateria Python: 76 testes aprovados; 34 contratos revalidados
após reforços adicionais. Integração catálogo/ETL e seis páginas em AppTest
aprovadas. Navegador local confirmou os novos valores e evidências, sem erros
de JavaScript ou transbordo horizontal em vista móvel.
