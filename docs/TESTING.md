# Testes de conformidade e regressão

O comando integrado pressupõe o portal em execução na porta 3001:

```powershell
cd dmc-workspace
npm run dev -- -p 3001
npm run test:compliance
```

Use `PORTAL_URL` para testar outra origem e `BROWSER_CHANNEL` para escolher o
browser instalado.

| Requisito | Cobertura principal |
| --- | --- |
| Categorias, horários, preços e curadoria | `curation`, `scheduling`, `catalog-matching`, `proposal-budget` |
| Edição, confirmações e assistente | `activity-confirmation`, `assistant-editing`, browser `confirmations` e `assistant` |
| Adição compatível e deslocações | browser `eligible-addition`, `road-routing` |
| Seis idiomas | browser `catalog`, `navigation`, `responsive`; `pdf-presentation` |
| Computador, tablet e telemóvel | browser `responsive` e `briefing` |
| PDFs e orçamento | `pdf-presentation`, `proposal-budget`, `versions` |
| Partilha, versão e idioma | browser `delivery`, `versions` |
| Preservação e recuperação | `versions`, browser `workspace-recovery` |
| Remoção, restauro e datas-limite | `trip-trash`, `versions`, browser `trash` |
| Catálogo e ETL | `catalog`, `catalog-etl`, browser `catalog` |

O executor interrompe no primeiro erro e só apresenta sucesso depois de passar
qualidade, tipos, testes unitários, ETL, build de produção e todos os fluxos de
browser.

## Histórico de validação

Os registos seguintes descrevem as execuções nas datas indicadas; não substituem
a execução dos testes no branch atual.

### Portal AWS: correções e validação de 12 de outubro de 2026

Os bloqueios identificados na primeira auditoria foram corrigidos. A versão
atual passou todas as verificações locais e de integração descritas abaixo.
O acesso pelo proxy real continua a depender da sessão AWS do utilizador.

#### Alterações

- Os 252 registos foram aprovados com autorização explícita do utilizador e
  publicados através do ETL. Cada aprovação criou uma revisão no catálogo.
  Duração e acessibilidade ausentes continuam assinaladas como `Por confirmar`.
  A cópia anterior está em
  `exports/backups/catalog-before-approval-20261012T215806Z.sqlite`.
- O agente utiliza as credenciais do papel IAM do SageMaker e
  `ChatBedrockConverse`, com suporte a ferramentas. A ausência de credenciais
  produz um erro explícito em vez de uma resposta fictícia.
- As partilhas usam a origem pública do Studio e o prefixo do portal. A
  validação de origem nas APIs de edição/publicação aceita a origem do Studio
  e continua a rejeitar origens externas.
- `eslint-config-next` foi alinhado com Next 16.4. Os testes Node 22 ativam o
  suporte a TypeScript. Os testes de browser usam Chromium por defeito.
- Os testes de assistente e adição usam os controlos atuais e aguardam a
  conclusão da atualização. O restauro testa uma viagem futura, porque uma
  viagem terminada não oferece o mesmo controlo de restauro.
- Os PDFs detetam fontes latinas e chinesas no Linux. Os testes verificam a
  estrutura PDF e o conteúdo da apresentação, sem um tamanho mínimo arbitrário.
- `scripts/start_aws_portal.sh` arranca o agente e o portal em conjunto e
  seleciona o Node 22.13 instalado pelo NVM. O agente só ativa reload quando
  `BLU_AGENT_RELOAD=1`.

#### Resultados

| Verificação | Resultado |
| --- | --- |
| `npm run check`: lint, tipos, formatação e testes | Passou |
| Testes unitários Node | 92 passaram; nenhum falhou ou foi ignorado |
| Testes Python: ETL e agente | 20 passaram |
| Compilação de produção | Passou |
| Baterias de browser | 12 passaram, incluindo os três fluxos antes pendentes |
| Integração real em armazenamento temporário | 16 verificações passaram |
| Proxy simulado, navegação e redirecionamento RSC | Passou na instância principal |
| Bedrock: chamada direta e endpoint de chat do agente | Respostas reais confirmadas |
| Ferramenta de pesquisa do catálogo do agente | Devolveu registos reais |
| Meteorologia pelo portal principal | HTTP 200, estado `available` |
| Catálogo na instância principal | 252 registos aprovados e publicados |
| Leitura independente dos PDFs PT/EN/ZH com pypdf | Três documentos com páginas e texto extraível |

As 16 verificações reais cobrem geração de dois dias de itinerário, gravação e
recarregamento de versão, PDF e ZIP em português, cinco traduções reais,
PDFs em inglês e chinês, partilha por documento e por link, origem dos pedidos
ao catálogo, envio de versão para o Lixo/restauro e disponibilidade do agente.

Os testes de interface cobrem navegação, briefing, catálogo, dataset, assistente,
confirmações, adição de oferta elegível, partilha, Lixo/restauro, recuperação do
workspace, apresentação do itinerário e responsividade. Navegação e catálogo
foram exercitados em seis idiomas; responsividade em cinco larguras e seis
idiomas. Algumas APIs são simuladas nesses testes de interface; as verificações
reais são executadas separadamente.

O teste de adição elegível foi repetido depois de substituir uma verificação
imediata pela espera da conclusão da atualização e do fecho do modal.

#### Serviços e repetição

O portal principal está na porta 3001 e o agente na porta 8000. A cópia da porta
3002 usou `BLU_EXPORT_DIR=/tmp/portal-aws-fixed-validation` e foi encerrada após
os testes. As propostas existentes não foram usadas como dados de teste.

Na raiz do projeto:

```bash
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws bash scripts/start_aws_portal.sh
```

Na pasta `dmc-workspace`, com Node >=22.13 e <25:

```bash
npm run check
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws npm run test:aws
```

Em Linux, instalar fontes WenQuanYi Zen Hei ou Noto Sans CJK para PDFs chineses.
Também é possível configurar `BLU_PDF_CJK_FONT` e `BLU_PDF_CJK_FACE`.

Os logs desta execução estão em `/tmp/portal-fixed-check.log`,
`/tmp/portal-fixed-build.log`, `/tmp/portal-fixed-python-tests.log`,
`/tmp/portal-fixed-api.log`, `/tmp/portal-aws-api-results.json`,
`/tmp/portal-browser-results.json`, `/tmp/portal-fixed-eligible-retest.log`
e `/tmp/portal-fixed-proxy.log`.

#### Limites da validação

A sessão autenticada do browser do utilizador não é acessível ao agente.
O teste específico do proxy reproduz remoção de prefixos e reescrita de
redirecionamentos, mas não substitui a verificação final no browser através
do SageMaker real. Partilhas alojadas no Studio continuam a exigir acesso AWS;
esta configuração não publica o portal para destinatários externos.

A aprovação do catálogo permite criar propostas preliminares. Não confirma
automaticamente disponibilidade, preços ou acessibilidade dos fornecedores.

### Integração de dev em plugin_TXT_export — 12 de outubro de 2026

#### Âmbito

Integração local de `origin/dev` (`ceae821`) no branch ativo
`plugin_TXT_export`, a partir de `def34fa`, por pedido do utilizador.
Sem alteração de branch ou publicação remota.

Os conflitos foram conciliados por funcionalidade. O merge incorpora os caminhos
AWS de recursos, navegação, APIs e partilhas, as correções IAM/Bedrock, as fontes
PDF Linux e as verificações de qualidade de dev. Preserva os seguintes elementos
do branch TXT/Canva:

- Exportação de `blu-roteiro-canva/1.1.0` a partir de versões guardadas.
- Downloads no workspace e no histórico, respeitando o idioma do cliente.
- Exclusão de contactos, referências de reserva e notas internas.
- TXT sem alterar o estado de exportação do PDF DMC.
- Exigência de restauro de uma versão no Lixo antes de exportar TXT.
- Plugin BLU Curadoria e instruções/configuração Canva originais.
- Atualização da meteorologia baseada numa chave estável de pedido.
- Adição assíncrona de atividades, mantendo o modal aberto após uma recusa.

Os ficheiros de `config/prompts/`, `plugins/blu-curadoria/`, o renderer
`itinerary-prompt.ts` e os seus testes foram comparados com o HEAD inicial e
permanecem intactos. O warehouse foi regenerado pelo ETL, sem edição manual dos
dados gerados. Os dados operacionais SQLite e as propostas existentes foram
preservados.

#### Validação

| Verificação | Resultado |
| --- | --- |
| Lint, tipos e formatação | Passaram |
| Testes unitários do portal, incluindo TXT/Canva | 97 passaram, nenhum ignorado |
| Testes Python de ETL e agente | 20 passaram |
| Testes do worker de tradução | 5 passaram |
| Catálogo → ETL → geração aprovada → inativação | Passou em diretórios temporários |
| Compilação de produção e arranque AWS | Passaram |
| Baterias de browser gerais | 12 passaram |
| TXT/Canva no browser | Passou em 1440, 390 e 320 px |
| APIs reais AWS | 16 verificações passaram |
| Proxy e redirecionamento RSC | Passou |
| Comando agregado `npm run test:compliance` | Passou, incluindo TXT/Canva e build final |

O teste TXT/Canva confirmou downloads, snapshots históricos imutáveis, validação
de entradas inválidas, proteção dos dados privados, Lixo/restauro e preservação
do estado de exportação PDF. Foram guardadas capturas em `.tools/canva-smoke/`.

Os testes de integração usaram a porta 3002 com
`BLU_EXPORT_DIR=/tmp/portal-txt-dev-merge-validation`. Os testes de interface usam
mocks em alguns endpoints; a geração, tradução, PDFs, partilha, restauro e TXT
foram também verificados em endpoints reais com armazenamento temporário.

O comando agregado de conformidade passou a incluir TXT/Canva, o prefixo AWS e
suporte a ficheiros TypeScript no Node 22. Os logs desta execução encontram-se
em `/tmp/portal-merge-check.log`, `/tmp/portal-merge-python.log`,
`/tmp/portal-merge-translation-tests.log`, `/tmp/portal-merge-catalog-etl.log`,
`/tmp/portal-merge-compliance.log`, `/tmp/portal-merge-canva.log`,
`/tmp/portal-merge-api.log`, `/tmp/portal-merge-proxy.log` e
`/tmp/portal-merge-services.log`.

#### Limites

A validação do proxy é local/simulada. O acesso HTTPS através do SageMaker real
exige a sessão AWS do utilizador, que não está disponível aos testes automáticos.
Os testes não criam uma proposta real no serviço Canva nem atualizam a instalação
remota do plugin. O pacote local, as instruções e a exportação TXT foram
preservados e testados.

### Validação do portal no AWS — 12 de outubro de 2026

**Resultado: parcialmente operacional; não validado como completamente operacional.**

#### Ambiente e alcance

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

#### Bloqueios concretos

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

#### Integração real: 10 de 13 verificações passaram

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

#### Testes de interface: 9 de 12 baterias passaram

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

#### Verificações técnicas

- Compilação de produção: passou na configuração AWS atual.
- Verificação de tipos: passou.
- Formatação: passou após formatar os ficheiros alterados.
- Testes unitários: 89 passaram, 1 falhou e 1 foi ignorado, num total de 91.
  A falha é uma asserção de tamanho mínimo de PDF superior a 10 000 bytes
  em `pdf-presentation.test.mjs`; o teste de fonte CJK foi ignorado.
- ESLint: não executa, devido à resolução de `eslint-config-next/core-web-vitals`.
  O projeto usa Next 16.4 com `eslint-config-next` 14.2.35.

#### Artefactos e próximos passos

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
