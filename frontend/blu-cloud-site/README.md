# Site BLU e concierge

Frontend React/Vite da página pública e do concierge. No Code Editor, a porta 5173 serve uma pré-visualização; a publicação CloudFront pertence à infraestrutura Data/Frontend/Backoffice, separada do portal DMC.

## Instalação e execução

Usar uma versão Node suportada pelo projeto. Nesta pasta:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

No Code Editor preparado, preferir `./bin/just blu up` na raiz e abrir **BLU · Interfaces → Leads / Concierge**. A configuração Vite trata o prefixo do proxy e a descoberta do Space; não copiar domínios de outro workspace.

## Configuração pública

`public/config.js` declara `BLU_CHAT_API`, `BLU_CONVERSATION_EVENTS_ENDPOINT` e `BLU_WHATSAPP_URL`. Endpoints vazios não demonstram acesso AWS. A stack gera os valores do ambiente no deployment; não guardar credenciais no navegador.

A referência `BLU-…` correlaciona conversa e WhatsApp, sem autenticar o visitante.
Retenção da conversa e autorização analítica são escolhas distintas. O modo `?demo=1` permite reiniciar a conversa e marca eventos como sintéticos; não desliga chamadas pagas nem impede a gravação de eventos autorizados.

## Build e verificação

```bash
npm run build
npm run test:sites
```

O packaging conserva `dist/client/index.html`, `dist/server/index.js` e `dist/.openai/hosting.json`. Não alterar os contratos de `worker/index.js`, `scripts/prepare-sites-build.mjs` e respetivos testes para uma publicação estática incompatível. A verificação visual segue os critérios abaixo.

O fluxo de dados e os requisitos de publicação estão em [Arquitetura AWS](../../infra/SPLIT_ARCHITECTURE.md). O [guião E2E](../../docs/DEMO_E2E.md) explica como demonstrar a integração sem misturar contactos reais e dados sintéticos.

## Verificação visual e funcional

A referência visual histórica foi a página inicial BLU Costa Travel. A comparação atual deve usar capturas reproduzíveis do candidato, não resultados de outro commit.

### Referência e recursos

A implementação usa estrutura React, estilos e recursos locais. O concierge é uma funcionalidade acrescentada à página de apresentação. Ligações para páginas externas mantêm o destino respetivo e não são uma prova de integração local.

As pastas de capturas citadas em ensaios antigos não integram o checkout atual.
Não apresentar dimensões antigas, imagens ausentes ou a declaração «passed» de um ensaio anterior como validação deste commit. O histórico está no Git.

### Critérios de comparação

| Superfície | Verificar |
| --- | --- |
| Desktop | Tipografia, cores, ordem das secções, imagens e rodapé |
| Móvel | Empilhamento, menu, legibilidade e ausência de transbordo |
| Concierge | Abertura/fecho, foco, sugestões e mensagens durante pedidos pendentes |
| Consentimento | Retenção só depois de autorização; análise separada |
| Demonstração | Eventos sintéticos e reset sem reaparecimento de resposta antiga |
| WhatsApp | Referência correta, novo separador e ausência de envio automático |

Guardar viewport, commit, origem da referência e capturas quando se fizer uma nova revisão. Não incluir contactos, transcrições reais ou credenciais nas imagens.

Os testes de packaging não substituem cenários de navegador ou aceitação AWS.
Usar mocks por omissão e o protocolo de [Testes](../../docs/TESTING.md).
