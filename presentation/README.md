# BLU — The Curation Experience

Dashboard independente organizado em três partes:

1. **Fundamentos técnicos:** seis cenas sobre requisitos, arquitetura, tecnologias,
   dados/processos, mecanismos de IA e validação/limites.
2. **Experiência de curadoria:** seis cenas narrativas, com escolhas que
   acompanham o mapa esquemático, o roteiro e a pré-visualização ilustrativa.
3. **Portal real:** abertura do Observatório indicado pelo utilizador num novo
   separador, dependente da sessão SageMaker.

A abertura começa na parte técnica. Os controlos no topo permitem saltar para
qualquer parte; o avanço sequencial passa da sexta cena técnica para o pedido.
O portal real não é incorporado nem alterado pela apresentação.

## Executar

Na raiz do projeto, com Python 3.12 ou 3.13:

```bash
python -B presentation/serve.py --port 3003
```

Abrir [a apresentação local](http://127.0.0.1:3003/). No Studio, obter a ligação
correta do ambiente atual com `python -B scripts/studio_urls.py --port 3003`.
A base pública dos dashboards está em `config/studio.local.json`.
No SageMaker Code Editor, abrir a porta 3003 com o caminho
`/codeeditor/default/ports/3003/` no domínio da instância. O servidor aceita o
prefixo ou o caminho direto e serve apenas a pasta `dist/`.

Não é preciso instalar pacotes, compilar o portal ou iniciar o agente.
O servidor usa a biblioteca padrão de Python e escuta em `127.0.0.1` por defeito.
Pode usar `--host 0.0.0.0` quando o ambiente exigir escuta noutras interfaces.

Os ficheiros estáticos também podem ser servidos por outro servidor HTTP.
O botão Abrir sistema e o CTA final **Explorar o Observatório real** derivam a
porta 3001 do endereço onde a apresentação está aberta. Localmente usam
`http://localhost:3001/catalog`; no Studio conservam o domínio e prefixo da sessão.
A navegação abre um separador separado e depende da sessão SageMaker do visitante.

## Controlos

- Anterior/Seguinte ou setas esquerda/direita: mudar de capítulo.
- Partes no topo: aceder aos fundamentos, à experiência ou ao portal real.
- Capítulos: acesso direto às cenas da parte selecionada.
- Pausar/Ativar animações: desligar ou ligar o movimento sem perder o estado.
- Requisitos e camadas: explorar contratos e responsabilidades.
- Tecnologias: escolher uma de sete áreas e abrir implementação e limites.
- Avançar o dado: mover o registo fictício ao longo das etapas.
- Simular falha na publicação: observar a preservação da entrega anterior.
- Mecanismos e contratos: distinguir regras, modelos e evidência de validação.
- Cultura/Sabores: mudar o interesse que aparece no mapa e no roteiro.
- Pontos do mapa: consultar os exemplos e respetivas pendências.
- Reservar a tarde livre: alterar a segunda tarde; pode repor a experiência.
- Etapas de dados e componentes da arquitetura: explorar as responsabilidades.
- Pedidos ao assistente: simular uma alteração permitida e uma atividade protegida.
- Exemplos de versões: comparar o exemplo inicial com as suas escolhas.
- Recomeçar, no último capítulo: limpar as escolhas e regressar ao primeiro.
- Ecrã inteiro: usar a capacidade do navegador; Escape permite sair.

As ligações da arquitetura têm movimento direcional; o registo percorre a
linha de etapas; mudanças de mecanismo e contrato recebem realces breves.
As animações não executam ETL, aprovação, testes ou chamadas a modelos.

O visual é adaptável a telemóveis, tablets e monitores largos. A preferência
`prefers-reduced-motion` desativa as animações. As transições não avançam cenas
automaticamente. O conteúdo deste protótipo está em português europeu.

## Isolamento e limites

Os dados são fictícios e o mapa é esquemático. O roteiro e as respostas do assistente são simulações preparadas, sem geração
por IA, disponibilidade, cálculo de preços ou reservas. A pré-visualização de
versões é ilustrativa: não guarda snapshots nem produz PDFs.
O estado vive apenas na memória da página e perde-se ao recarregar.

A apresentação não lê nem escreve `data/`, `warehouse/`, `exports/` ou o
armazenamento do portal. Não faz chamadas às suas APIs, não precisa de rede
externa e não altera os serviços nas portas 3001 e 8501. Os ícones e elementos
visuais são SVG/CSS locais; não há dependências de fontes externas.

Esta pasta é um protótipo local de apresentação, sem publicação ou deployment.
O guião completo está em [APRESENTACAO.md](../docs/APRESENTACAO.md).

## Verificação

O cenário de navegador reutiliza o Playwright já instalado nas dependências
de desenvolvimento de `dmc-workspace`; não é uma dependência de execução.
Com a apresentação iniciada:

```bash
node presentation/test-browser.mjs
```

`PRESENTATION_URL` permite indicar outro endereço. A verificação cobre quatro
larguras, as seis cenas técnicas e os seis capítulos narrativos, teclado,
persistência entre cenas, reposição, animações ligadas/desligadas, movimento
reduzido, simulação de falha de publicação,
erro de ecrã inteiro, URL final exato e ausência de chamadas externas/API.
O teste verifica o destino sem visitar o portal real. As capturas de inspeção ficam em `/tmp/`.

## Conteúdo técnico e complementos

`dist/technology-content.js` contém o inventário editorial: dependências,
versões declaradas, responsabilidade, exemplo, implementação e referências.
A apresentação distingue esses dados da configuração efetiva e dos resultados
de desempenho. Modelo/região usados, decisões da equipa e medições ficam
identificados como informação a complementar, sem valores inventados.

A experiência tem pedido, território, proposta, colaboração, entrega e
encerramento. Os capítulos repetidos de dados e arquitetura foram retirados,
com o código e estilos específicos. A auditoria e as lacunas estão registadas
no [guião](../docs/APRESENTACAO.md).

## Conteúdo incorporado do PowerPoint — 21 de outubro de 2026

A apresentação integra informação do ficheiro local
`PG 5_edicao - GPAIDMP - Trabalho de Grupo - Apresentação - FDC - v2026-10-30.pptx`:
contexto académico P6, parceria BLU, objetivo de apoio ao curador, três componentes
(fontes, portal e Canva), abordagens Soft/Classic/Signature, equipa e visão futura.
A data de 30 de outubro é apresentada como prevista, conforme o documento.

No capítulo **A proposta**, as três abordagens têm seleção interativa, com Classic
predefinido. A seleção explica a profundidade da experiência e acompanha o resumo
da entrega; não recalcula o roteiro fictício nem inventa preços.

As páginas de trabalho do PPT não comprovam funcionalidades. Google Forms foi
substituído pelo briefing do portal; TXT inclui JSON, e o PDF Canva é independente
do PDF DMC. O portal tem seis idiomas e o Observatório nativo seis áreas. HPO,
Model Registry, Endpoint e Model Monitor não são apresentados como serviços
operacionais, nem os resultados históricos do PPT como medições atuais.
