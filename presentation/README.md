# BLU — The Curation Experience

Dashboard de apresentação independente. Um caso fictício acompanha o percurso
**pedido → território → proposta → dados → colaboração → entrega → arquitetura
→ próximo passo**, com escolha de interesse, mapa esquemático e uma alteração
reversível ao roteiro. São oito capítulos com navegação livre ou sequencial.

## Executar

Na raiz do projeto, com Python 3.12 ou 3.13:

```bash
python -B presentation/serve.py --port 3003
```

Abrir [a apresentação local](http://127.0.0.1:3003/).
No SageMaker Code Editor, abrir a porta 3003 com o caminho
`/codeeditor/default/ports/3003/` no domínio da instância. O servidor aceita o
prefixo ou o caminho direto e serve apenas a pasta `dist/`.

Não é preciso instalar pacotes, compilar o portal ou iniciar o agente.
O servidor usa a biblioteca padrão de Python e escuta em `127.0.0.1` por defeito.
Pode usar `--host 0.0.0.0` quando o ambiente exigir escuta noutras interfaces.

Os ficheiros estáticos também podem ser servidos por outro servidor HTTP.
O botão Abrir sistema e o CTA final **Explorar o Observatório real** apontam
para o [endereço indicado pelo utilizador](https://ai5qwwdt6siuxug.studio.eu-west-1.sagemaker.aws/codeeditor/default/ports/3001/catalog).
A navegação abre um separador separado e depende da sessão SageMaker do visitante.
O endereço está centralizado em `observatoryUrl`, no ficheiro `dist/app.js`.

## Controlos

- Anterior/Seguinte ou setas esquerda/direita: mudar de capítulo.
- Capítulos no topo: acesso direto a cada cena.
- Cultura/Sabores: mudar o interesse que aparece no mapa e no roteiro.
- Pontos do mapa: consultar os exemplos e respetivas pendências.
- Reservar a tarde livre: alterar a segunda tarde; pode repor a experiência.
- Etapas de dados e componentes da arquitetura: explorar as responsabilidades.
- Pedidos ao assistente: simular uma alteração permitida e uma atividade protegida.
- Exemplos de versões: comparar o exemplo inicial com as suas escolhas.
- Recomeçar, no último capítulo: limpar as escolhas e regressar ao primeiro.
- Ecrã inteiro: usar a capacidade do navegador; Escape permite sair.

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
larguras, os oito capítulos, teclado, persistência entre cenas, reposição,
erro de ecrã inteiro, URL final exato e ausência de chamadas externas/API.
O teste verifica o destino sem visitar o portal real. As capturas de inspeção ficam em `/tmp/`.
