# BLU — Viajar com intenção

Pitch comercial para viajantes e parceiros, com seis momentos e um percurso sugerido de cinco a sete minutos. A narrativa apresenta a escuta, a curadoria humana e a proposta de viagem através de um caso ilustrativo em Lisboa.
O guião e as mensagens de cada momento estão em [APRESENTACAO](../docs/APRESENTACAO.md).

## Percurso e interações

1. **A promessa:** conhecer quem viaja e escolher com intenção.
2. **A sua viagem:** escolher cultura ou gastronomia para um exemplo de dois dias.
3. **O destino:** explorar três possibilidades num mapa esquemático.
4. **A curadoria:** experimentar uma tarde livre, mantendo o primeiro dia.
5. **A proposta:** consultar uma pré-visualização que acompanha as escolhas.
6. **Vamos conversar:** escolher o encerramento para viajantes ou parceiros.

O contacto abre o WhatsApp público já utilizado em `frontend/website/data/channels.json`, com um texto inicial adequado ao público.
Não envia mensagens automaticamente nem inclui as escolhas ilustrativas na mensagem.
O teste de navegador verifica que o destino continua a corresponder a essa configuração; se o contacto mudar, atualizar o URL público em `dist/app.js`.

As categorias Soft/Classic/Signature, a comparação técnica de versões, os fundamentos de engenharia e os elementos académicos não integram o pitch.
A aplicação real e o Observatório permanecem pontos de entrada independentes.

## Executar e abrir

Na raiz, com Python 3.12 ou 3.13:

```bash
.venv/bin/python -B presentation/serve.py --port 3003
```

Abrir [o pitch local](http://127.0.0.1:3003/). O servidor utiliza apenas a biblioteca padrão e não depende do portal, de modelos, de credenciais ou de chamadas AWS. Serve exclusivamente `dist/` e não apresenta listagens de diretórios.
Os recursos versionados nessa pasta são as fontes estáticas; não há passo de build.

No SageMaker Studio Code Editor, **BLU · Interfaces** continua a abrir a apresentação pelo proxy web do Space atual. O servidor reconhece o prefixo do pedido; `BLU_PRESENTATION_BASE_PATH` permite indicar um prefixo explícito.
O terminal do VS Code remoto pode iniciar o mesmo serviço.

Os ficheiros de `dist/` também funcionam noutro servidor estático. Abrir o pitch não exige sessão num portal BLU; quando alojado no proxy privado do SageMaker, o acesso ao próprio proxy continua a depender da sessão AWS. Não há publicação pública implícita nesta alteração.

## Navegação e leitura

- Anterior/Seguinte e índice: percorrer os seis momentos.
- Em janelas baixas, **Escolher capítulo** substitui o índice.
- Setas do teclado: percorrer passos laterais e depois mudar de momento.
- **Vamos conversar**, no cabeçalho: ir diretamente ao contacto.
- **Recomeçar**: repor as escolhas iniciais.
- Ecrã inteiro e controlo de animações: adaptar a sessão ao contexto de apresentação.

O avanço é manual. `prefers-reduced-motion` desativa o movimento. Em ecrãs compactos, o conteúdo divide-se em passos laterais, sem reduzir o texto de leitura abaixo de 14 px. A impressão apresenta o momento aberto em fluxo contínuo; não exporta automaticamente todos os momentos para PDF.

## Isolamento e limites

O caso, o mapa e o documento são ilustrativos. Não são uma oferta comercial, uma proposta emitida, uma reserva ou uma consulta de disponibilidade.
Preço, condições e disponibilidade permanecem por confirmar.
As escolhas vivem apenas em memória e perdem-se ao recarregar.

O pitch não consulta APIs, não usa armazenamento do navegador e não altera fontes, catálogo, warehouse ou exports. Os recursos são locais e não exigem fontes ou bibliotecas externas. A única saída comercial é uma ligação acionada pelo visitante; o envio da mensagem pertence ao próprio WhatsApp.

## Verificação

Com o servidor iniciado e o ambiente de navegador preparado:

```bash
node presentation/test-browser.mjs
node presentation/test-viewport.mjs
```

Os testes reutilizam o Playwright de `dmc-workspace`. `PRESENTATION_URL` permite selecionar a instância local a testar. Não abrem nem enviam o contacto WhatsApp.
Cobrem escolhas, persistência entre momentos, reposição, dois públicos, navegação, redução de movimento, falha de ecrã inteiro, isolamento e acesso por prefixos de diferentes workspaces. A bateria de enquadramento percorre sete tamanhos de janela. As capturas de inspeção ficam em `/tmp/`.
