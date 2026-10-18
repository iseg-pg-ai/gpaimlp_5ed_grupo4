# BLU — The Curation Experience

Dashboard de apresentação independente. Um caso fictício acompanha o percurso
**pedido → território → proposta**, com escolha de interesse, mapa esquemático
e uma alteração reversível ao roteiro.

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
O botão Abrir sistema aponta para o portal na porta 3001; no Studio conserva
o domínio e usa o prefixo dessa porta. A navegação abre uma janela separada.

## Controlos

- Anterior/Seguinte ou setas esquerda/direita: mudar de capítulo.
- Capítulos no topo: acesso direto a cada cena.
- Cultura/Sabores: mudar o interesse que aparece no mapa e no roteiro.
- Pontos do mapa: consultar os exemplos e respetivas pendências.
- Reservar a tarde livre: alterar a segunda tarde; pode repor a experiência.
- Recomeçar: limpar as escolhas e regressar ao primeiro capítulo.
- Ecrã inteiro: usar a capacidade do navegador; Escape permite sair.

O visual é adaptável a telemóveis, tablets e monitores largos. A preferência
`prefers-reduced-motion` desativa as animações. As transições não avançam cenas
automaticamente. O conteúdo deste protótipo está em português europeu.

## Isolamento e limites

Os dados são fictícios e o mapa é esquemático. O roteiro é uma simulação
preparada, sem geração por IA, disponibilidade, cálculo de preços ou reservas.
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
larguras, teclado, persistência entre cenas, reposição, erro de ecrã inteiro e
ausência de chamadas externas/API. As capturas de inspeção ficam em `/tmp/`.
