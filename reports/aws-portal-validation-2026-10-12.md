# Validação do portal no AWS — 12 de outubro de 2026

**Resultado: parcialmente operacional; não validado como completamente operacional.**

## Ambiente e alcance

- Portal Next.js 16.4 em produção na porta 3001 do SageMaker Code Editor.
- Testes de integração na porta 3002, com o mesmo build e prefixo público,
  usando `BLU_EXPORT_DIR=/tmp/portal-aws-validation-20261012`.
- Testes de browser em Chromium, com o prefixo AWS, em desktop e mobile.
- O teste específico do proxy simula remoção do prefixo e reescrita de
  redirecionamentos, incluindo correção do parâmetro RSC.
- A sessão autenticada do utilizador no browser não está disponível ao agente.
  O pedido HTTPS externo sem essa sessão devolveu 403; a validação local/simulada
  não substitui um teste autenticado através do proxy real.
- Os testes de interface existentes usam mocks em várias APIs. Os testes reais
  abaixo são independentes desses mocks.

## Bloqueios concretos

1. **Geração de itinerários: HTTP 422.** Os 252 registos do catálogo estão no
   estado `review`. O catálogo publicado não fornece oferta aprovada à geração.
   É necessário rever/aprovar oferta e publicar o catálogo. Não foram aprovados
   registos automaticamente durante a validação.
2. **Agente de IA: indisponível.** Não existe serviço acessível na porta 8000.
   O endpoint do assistente pode usar o comportamento determinístico/fallback;
   isso não comprova o funcionamento de LangChain/Bedrock.
3. **Partilha: origem incorreta.** A criação de uma partilha em português
   devolveu um URL com origem `http://localhost:3000`, em vez da origem HTTPS do
   Studio. O documento estava acessível pela API local. `PORTAL_PUBLIC_ORIGIN`
   é usado pelo servidor de arranque, mas a API de partilha procura
   `BLU_PUBLIC_URL` ou a origem de `request.url`.
   Mesmo com o URL corrigido, o acesso por um destinatário externo sem sessão AWS
   não foi demonstrado.

## Integração real: 10 de 13 verificações passaram

| Verificação | Resultado |
| --- | --- |
| Geração com briefing válido | Falhou: catálogo sem oferta aprovada, HTTP 422 |
| Guardar e recarregar versão | Passou |
| PDF em português | Passou; assinatura PDF, 7 500 bytes |
| ZIP em português | Passou; assinatura ZIP, 5 936 bytes |
| Tradução pt → en/es/fr/de/zh | Cinco verificações passaram com modelos reais |
| PDF em inglês | Passou; assinatura PDF, 7 451 bytes |
| Partilha e documento | Falhou na origem do URL; documento local acessível |
| Enviar versão para o Lixo e restaurar | Passou, em armazenamento temporário |
| Serviço de IA | Falhou: ligação indisponível |

O exemplo antigo de briefing não incluía campos agora obrigatórios. A execução
final inclui `childrenAges`, `specialOccasion`, `notes`, `accommodation` e
`diningPace`; os resultados acima referem-se a essa execução final.

## Testes de interface: 9 de 12 baterias passaram

Passaram navegação, briefing, catálogo, exploração do dataset, confirmações,
interface de partilha, recuperação do workspace, apresentação do itinerário e
responsividade. Navegação e catálogo foram exercitados em seis idiomas;
responsividade foi exercitada em cinco larguras e seis idiomas.

O catálogo foi repetido com Node 22.13 e suporte a TypeScript, após a primeira
tentativa ter usado Node 20 e não conseguir importar os ficheiros `.ts`.

Três baterias não conseguiram concluir:

- `assistant.mjs`: não encontrou o botão “Remover última atividade do dia 1”.
- `eligible-addition.mjs`: não encontrou “Adicionar oferta do catálogo a este dia”.
- `trash.mjs`: não encontrou o botão “Restaurar viagem”.

Estes timeouts impedem certificar esses fluxos. Não demonstram, por si só,
se há um defeito funcional ou seletores desatualizados. A operação real de
restauro pela API passou.

O teste `sagemaker-proxy.mjs` passou na instância principal: navegação nas cinco
páginas, pedidos à API, isolamento dos caminhos e redirecionamento RSC.

## Verificações técnicas

- Compilação de produção: passou na configuração AWS atual.
- Verificação de tipos: passou.
- Formatação: passou após formatar os ficheiros alterados.
- Testes unitários: 89 passaram, 1 falhou e 1 foi ignorado, num total de 91.
  A falha é uma asserção de tamanho mínimo de PDF superior a 10 000 bytes
  em `pdf-presentation.test.mjs`; o teste de fonte CJK foi ignorado.
- ESLint: não executa, devido à resolução de `eslint-config-next/core-web-vitals`.
  O projeto usa Next 16.4 com `eslint-config-next` 14.2.35.

## Artefactos e próximos passos

- Teste real repetível: `dmc-workspace/tests/aws-api-validation.mjs`.
- Teste de proxy: `dmc-workspace/tests/browser/sagemaker-proxy.mjs`.
- Resultados detalhados: `/tmp/portal-aws-api-results.json`,
  `/tmp/portal-browser-results.json`, `/tmp/portal-browser-catalog-retest.log`,
  `/tmp/portal-aws-unit-tests.log`, `/tmp/portal-aws-lint.log`,
  `/tmp/portal-aws-format.log` e `/tmp/portal-aws-proxy.log`.

Para concluir a operacionalização: publicar oferta aprovada, iniciar e validar
o agente de IA com Bedrock, corrigir a origem da partilha, investigar os três
testes de interface e as verificações de qualidade pendentes, e realizar um
teste final com uma sessão AWS autenticada no browser do utilizador.

A cópia de teste foi encerrada após a validação. O portal principal permanece
ativo na porta 3001. As propostas existentes não foram usadas como dados de teste.
