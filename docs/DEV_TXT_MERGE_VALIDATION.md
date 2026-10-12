# Integração de dev em plugin_TXT_export — 12 de outubro de 2026

## Âmbito

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

## Validação

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

## Limites

A validação do proxy é local/simulada. O acesso HTTPS através do SageMaker real
exige a sessão AWS do utilizador, que não está disponível aos testes automáticos.
Os testes não criam uma proposta real no serviço Canva nem atualizam a instalação
remota do plugin. O pacote local, as instruções e a exportação TXT foram
preservados e testados.
