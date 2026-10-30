# DMC Workspace

O DMC Workspace é o portal operacional usado pelo consultor ou curador para recolher o briefing, consultar e manter o catálogo, gerar itinerários, acompanhar confirmações e exportar propostas versionadas.

## Instalação e execução

No SageMaker Code Editor, preparar o ambiente pelo [onboarding](ONBOARDING.md) e usar os launchers na raiz. `./bin/just blu it` recupera/materializa dados e constrói o sistema; `./bin/just blu up` inicia o ambiente já preparado.
Não regenerar o warehouse manualmente para contornar uma cache ausente.

Para desenvolvimento local fora do proxy, com dados válidos selecionados por `BLU_*_DIR`, em `dmc-workspace/`:

```bash
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001). O portal exige Node >=22.13 e <25 e Python 3.12/3.13 para a ponte local.

PDFs traduzidos exigem o grupo Python `translation`, modelos locais instalados com autorização e, para mandarim, fonte CJK. Os passos estão no [guia de preparação da tradução e fonte CJK](ONBOARDING.md#7-preparar-tradução-e-fonte-cjk).
A tradução não precisa de um servidor Python adicional nem de fornecedor externo.

## Aparência

O botão com lua/sol no cabeçalho alterna entre os temas claro e escuro.
O tema claro é o padrão; a preferência fica guardada neste navegador e sincroniza entre separadores. A impressão e os PDFs mantêm a apresentação clara. O tema do portal não altera o dashboard Streamlit original.

Validar a alternância, persistência, contraste e adaptação ao ecrã com `npm run test:theme` em `dmc-workspace/`, com o portal em execução.

## Fluxo funcional

1. Criar uma viagem e completar as etapas Cliente, Viagem, Preferências, Restrições e Rever.
2. Gerar uma proposta a partir dos registos aprovados e das regras de curadoria.
3. Rever os dias, os horários propostos, as fontes e as pendências.
4. Completar e guardar os dados de confirmação de cada atividade.
5. Usar o assistente para alterações explícitas que respeitam atividades protegidas ou confirmadas.
6. Escolher o idioma do cliente e exportar a versão portuguesa e a variante traduzida.

## Catálogo

O **Observatório interativo** é uma versão nativa da análise, com o estilo do portal: Panorama, Explorar oferta, Destinos, Preços, Histórico e Qualidade.
Usa `/api/observatory` e a ponte Python existente para ler o warehouse numa transação SQLite, sem nova persistência e sem depender do serviço Streamlit.
A aplicação original em `dashboard/` e o seu arranque permanecem inalterados.

O mapa permite deslocação, zoom, camadas, nomes dos lugares e agrupamento visual que se adapta ao zoom. Selecionar um ponto abre a ficha; os membros de um grupo podem ser escolhidos individualmente. Registos sem coordenadas continuam na lista. Os contornos reutilizam o recurso Natural Earth existente, em domínio público, sem pedidos a fornecedores cartográficos.

A comparação aceita duas a quatro ofertas, sem calcular um vencedor ou somar preços. A mediana de preços exige a mesma categoria, unidade harmonizada, condições originais, natureza comercial e moeda. Ausências não são zeros.
O histórico conta roteiros distintos e liga atrações apenas pelo identificador explícito, sem inferir correspondências por nome. Não representa vendas.

A confirmação e a validade dos campos são reavaliadas através dos contratos partilhados do ETL à data da consulta. Os indicadores distinguem preenchimento, evidência e integridade; nenhum certifica disponibilidade ou compatibilidade.
As análises representam a entrega publicada e não as edições por publicar.
**Atualizar análise** relê a entrega após uma publicação, preservando os filtros.

**Gerir catálogo** mantém o editor operacional. Alternar entre as duas vistas preserva a sessão de exploração e o formulário em curso enquanto a página permanecer aberta. Em caso de indisponibilidade analítica, é possível tentar novamente ou continuar no editor.

Validação: `npm run test:observatory`, com o portal iniciado, verifica as seis áreas e as interações com o warehouse local. O teste usa tradução simulada e simula uma falha do endpoint para verificar a recuperação; não guarda registos.

A página `/catalog` permite pesquisar, filtrar, criar, editar e inativar atividades, restaurantes e experiências. Os registos seguem os estados Rascunho,
Em revisão, Aprovado e Inativo. Apenas os aprovados podem entrar na geração.

A persistência do catálogo usa SQLite Python e mantém o esquema existente.
As validações de entrada são partilhadas com o editor em TypeScript; cada edição é guardada com verificação de revisão numa transação. Uma edição concorrente obsoleta devolve conflito 409 e exige reabrir o registo.

O editor guarda a oferta e o histórico em `data/portal/catalog.sqlite`. O ETL publica os registos aprovados no warehouse; não se deve editar `warehouse/` manualmente. Os preços estruturados incluem valor, moeda, unidade e estado
Confirmado, Estimado ou Por confirmar. Zero representa explicitamente um serviço gratuito.

Os campos de compatibilidade ligam a oferta às respostas estruturadas do briefing. Correspondências desconhecidas não são convertidas em compatibilidade automática.

## Geração e horários

A geração usa o destino, as datas, o ritmo, os interesses, as exclusões, o esforço, o nível da proposta e a personalização. Distribui a oferta entre as três categorias quando existem registos elegíveis.

Horários de funcionamento e durações reconhecidos permitem propor intervalos sem sobreposição. Encerramentos ou formatos ambíguos deixam a atividade Por agendar.
As margens de deslocação são estimativas e não correspondem a percursos medidos.
Uma proposta não equivale a reserva ou confirmação do fornecedor.

## Confirmações

Em **Dados e confirmações**, o curador pode registar horário, local, preço, fornecedor, referência, contacto e evidência. Os dados existentes no catálogo são preenchidos automaticamente; alterações específicas da viagem têm precedência.

**Guardar progresso** cria uma versão com os dados parciais. **Confirmar atividade** exige os campos e evidências aplicáveis. A confirmação é manual e não contacta o fornecedor. Atividades protegidas ou confirmadas não podem ser removidas pelo assistente.

## Logística da viagem

O briefing guarda o ponto, a hora e o número de voo de chegada e partida. Horas e voos são opcionais para preservar propostas antigas e podem ser completados mais tarde. Estes dados acompanham o snapshot da versão, o resumo de revisão e o PDF; não são inferidos nem substituídos pelo ETL ou pelo assistente.

## Assistente

O assistente aceita pedidos em português e inglês. Exemplos em português:

```text
adicionar "nome exato ou identificador do catálogo" ao dia 1
substituir atividade 1 do dia 1 por "nome exato ou identificador do catálogo"
reagendar atividade 1 do dia 1 para 14:00
reorganizar dia 1 na ordem 2,1,3
remover atividade 1 do dia 1
remover última atividade do dia 1
```

O comando `Ajuda` apresenta os formatos disponíveis. Pedidos incompatíveis com o briefing, o orçamento, os horários ou as proteções são recusados com uma explicação.
As alterações manuais e as propostas aceites do Blu guardam a respetiva origem, sem bloquear o dia. O bloqueio continua a ser uma escolha explícita do curador.
Regenerar um dia preserva atividades alteradas manualmente; remover, substituir, reagendar ou mover uma atividade específica continua sujeito à revisão e aceitação.

## Exportação e versões

As versões são imutáveis e sequenciais por viagem. Durante a execução, o histórico é materializado em `BLU_EXPORT_DIR/history.sqlite`; os PDFs e JSON de suporte ficam sob o mesmo diretório. A release operacional ativa no S3 é a persistência permanente, e os checkpoints do `just blu it` protegem a recuperação integral.

O painel reúne a versão atual, o idioma do cliente, a exportação e o histórico. A exportação entrega português e o idioma escolhido no mesmo ZIP. Variantes linguísticas pertencem à mesma versão e reutilizam os bytes já guardados.
Alterações posteriores ao catálogo não modificam snapshots ou PDFs antigos.

O orçamento discriminado apresenta preços calculáveis, valores por confirmar e totais separados por moeda. O orçamento disponível do cliente aparece separado do custo conhecido da proposta. Valores desconhecidos não são apresentados como zero.

## Partilha com o cliente

O botão **Partilhar** abre um painel para escolher a versão, o idioma e a forma de entrega. A ligação de acesso apresenta uma página simples da proposta; a opção Documento PDF abre diretamente o PDF imutável dessa versão e idioma. O email do cliente vem do briefing e pode ser alterado antes de preparar a mensagem.

O portal abre o programa de email do computador com destinatário, assunto, texto e ligação preenchidos. O envio é confirmado nessa aplicação. Antes de criar o acesso, o curador confirma a autorização do destinatário e escolhe uma validade
de 7, 30 ou 90 dias. Sem consentimento ou prazo, incluindo partilhas antigas, o
acesso falha fechado.

As ligações ficam guardadas no histórico SQLite de exportações com versão,
idioma, destinatário, instante de consentimento, validade e estado de revogação.
A página **Histórico** permite consultar e revogar cada acesso. A expiração
impede novas consultas; enviar a respetiva versão para o Lixo revoga a ligação de
forma atómica e restaurar a versão não a reativa. Os metadados permanecem para
auditoria até à eliminação definitiva da versão ou viagem. Em instalações
acessíveis fora do computador local, `BLU_PUBLIC_URL` deve conter a origem pública
do portal, por exemplo `https://propostas.example.com`.

## Planos ativos e Lixo

O ícone de lixo de cada viagem na barra lateral retira a viagem dos planos ativos
sem eliminar o seu briefing, roteiro, mensagens ou referência à versão. A página
**Lixo** permite pesquisar as viagens removidas, consultar a data e distinguir a
remoção manual da automática. A opção automática move apenas viagens cuja data de
fim seja anterior ao dia atual.

Cada versão no histórico tem uma ação própria para a enviar para o Lixo. Isto não
remove a viagem nem uma atividade do roteiro. As versões removidas deixam de surgir
no histórico ativo e as respetivas partilhas são revogadas, mas os snapshots,
PDFs e variantes linguísticas permanecem no SQLite e podem ser restaurados na
página Lixo. A remoção de uma atividade continua a ser feita no cartão do
respetivo dia e cria uma nova versão do roteiro.

A limpeza definitiva é verificada uma vez a cada 24 horas, ao abrir o portal ou a
página Lixo. Uma viagem ou versão no Lixo expira quando a data de fim guardada na
proposta é anterior ao dia atual em Lisboa. As versões anteriores são eliminadas
automaticamente, mas a versão final de cada viagem fica protegida. A sua eliminação
definitiva exige uma confirmação explícita do utilizador e não pode ser anulada.

Depois dessa confirmação, o portal remove a viagem, a versão final, as partilhas,
os PDFs e as variantes linguísticas associados apenas quando todos os snapshots já
expiraram. Ao eliminar automaticamente uma versão anterior, remove apenas os
ficheiros e registos dessa versão. As viagens e versões ainda dentro do período de
conservação não são alteradas.

Com o portal em execução, `npm run test:trash` valida no navegador a remoção e o
restauro de uma viagem e de uma versão.

## Apresentação dos PDFs BLU

As novas exportações têm capa em azul-petróleo e creme, apontamentos dourados,
cliente e destino em destaque, datas, versão e estado preliminar. O resumo da
viagem é separado dos dias; cada atividade apresenta horário, título,
localização, descrição, preço e confirmações por ordem de leitura. Fontes e
critérios aparecem com menor destaque. O rodapé identifica a versão e a
paginação.

Português e traduções usam o mesmo renderer, com quebra de linhas e paginação
conforme o comprimento dos textos. Mandarim mantém a configuração
`BLU_PDF_CJK_FONT`. O número de páginas pode variar entre idiomas. Os PDFs já
arquivados não são redesenhados: continuam a ser entregues com os bytes
originais; o novo desenho aplica-se a PDFs ainda não gerados.

O PDF DMC não inclui fotografias de atividades. As imagens licenciadas do
dashboard são enquadramento de destino e não comprovam associação a cada oferta.
Introduzir fotografias no PDF exige seleção, licença e créditos aprovados para
essa utilização. A decoração geométrica da capa é desenhada diretamente no PDF.

## Prompt TXT

O contrato atual é `blu-roteiro-prompt/1.0.0`. O idioma escolhido aplica-se ao
prompt e aos PDFs.

1. Rever o roteiro e escolher o idioma do cliente.
2. Clicar **Exportar TXT**. O portal guarda uma versão antes do download.
   As versões anteriores também disponibilizam o respetivo prompt.
3. Rever o TXT antes de o usar numa ferramenta externa autorizada.

O ficheiro contém instruções neutras e dados JSON da versão guardada. Não está
associado a uma aplicação, integração ou modelo visual. Mantém preços, moedas,
restrições e pendências; exclui contactos, referências de reserva e notas
internas, mas inclui o nome do cliente. Descarregar o TXT não altera os PDFs
persistidos nem o estado de exportação PDF.

O histórico global de versões também oferece TXT por idioma. Versões no Lixo
devem ser restauradas antes da exportação. O TXT inclui períodos livres,
personalização estruturada, capacidade diária e resumos de deslocações guardados.
As rotas continuam estimativas sujeitas a revisão; a meteorologia consultada
dinamicamente não pertence ao snapshot e não é incluída no TXT.

A partilha integrada continua a entregar o PDF DMC da versão selecionada. Um
documento criado externamente a partir do prompt não substitui artefactos
históricos, não atualiza ligações públicas e não marca a versão como PDF exportado
no portal. Alterar o roteiro exige exportar novamente o prompt da versão correta.

### Canva: criação em massa por dia

O botão **Canva: dias (CSV)** guarda uma versão e descarrega um CSV com uma linha
por dia (viagem, cliente, período, dia, data, título, local, resumo, programa com
horas e locais, pendências e versão). No Canva, abrir uma cópia do
[modelo BLU](https://canva.link/5u8zxudd1vkcbth), escolher **Apps › Criação em
massa**, carregar o CSV e ligar cada campo a uma caixa de texto da página do dia:
o Canva cria uma página por dia. Segue as regras do TXT: sem contactos,
referências de reserva nem notas internas; células que pareçam fórmulas ficam
como texto. O orçamento e as condições continuam no TXT/PDF. O texto vai no idioma
em que a proposta foi guardada; a tradução continua a ser a do TXT/PDF.

## Idiomas

A interface suporta português, inglês, mandarim, espanhol, francês e alemão. Os
textos livres dos PDFs são traduzidos localmente. Para mandarim, pode ser necessário
configurar `BLU_PDF_CJK_FONT` e, para ficheiros TTC, `BLU_PDF_CJK_FACE`.

Cada instalação deve preparar os seus modelos e fonte CJK. A aprovação de um
PDF exige verificar texto, números, paginação e legibilidade na versão exportada;
a estrutura válida do ficheiro não substitui revisão semântica. A fundamentação
e os limites estão em [Decisões](DECISIONS.md#entregas-tradução-e-apresentação-ao-utilizador).

## Arquitetura resumida

```text
src/app/          páginas e APIs Next.js
src/components/   interface e editores
src/hooks/        estado das viagens e do catálogo
src/lib/          curadoria, validação, versões, tradução e PDFs
tests/            testes unitários, integração e navegador
```

O portal lê os caminhos indicados por `BLU_WAREHOUSE_DIR`, `BLU_DATA_DIR`,
`BLU_EXPORT_DIR` e `BLU_OPERATIONAL_DIR`. No SageMaker, estes caminhos pertencem
à cache efémera materializada a partir do S3. As viagens em edição também são
mantidas no `localStorage` do navegador. No modo Code Editor não há login próprio
do portal nem sincronização de rascunhos entre utilizadores. O modo ALB/Cognito
implementado depende de configuração e identidade cloud verificadas.

## Validação

Dentro de `dmc-workspace`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Execução na AWS

### SageMaker Studio Code Editor

O endereço do Space é descoberto pelos metadados e `sagemaker:DescribeSpace`.
`config/studio.local.json` é a alternativa fora do SageMaker. Um override explícito
`PORTAL_PUBLIC_ORIGIN` tem prioridade; não o copiar de outro workspace.

Para uso normal, iniciar pela raiz com `./bin/just blu up`. Para diagnóstico
isolado, com dependências e caminhos de dados já preparados:

```bash
bash scripts/start_aws_portal.sh
```

Listar os endereços resolvidos com `python3 -B scripts/studio_urls.py`.
O launcher configura origem e prefixo do proxy e recompila quando necessário.
Usar **BLU · Interfaces** no editor web para abrir a porta 3001; um túnel SSH
`localhost` não equivale a acesso HTTPS no Studio. O agente continua subprocesso
Python do portal, sem serviço HTTP próprio.

O arranque valida a origem (apenas HTTPS, sem caminho), a porta e o prefixo.
Se a porta estiver ocupada, termina antes de recompilar: encerrar o processo
anterior ou definir outra `PORT`. O prefixo por defeito acompanha essa porta.
`npm run start:aws` exige um build completo com o mesmo prefixo e a origem
configurada; perante incompatibilidade, usar novamente o script da raiz.
Não reutilizar builds de outra configuração nem copiar apenas parte de `.next`.

### Servidor direto experimental

O portal é uma aplicação Next.js com rotas de servidor e não pode ser publicado
como um conjunto de ficheiros estáticos num bucket S3. O diretório de trabalho
tem de ser `dmc-workspace`; os caminhos de dados devem ser fornecidos pelas
variáveis `BLU_*_DIR` e materializados antes do arranque.

Numa máquina Linux com Node.js 22.13 a 24.x, executar a partir da raiz:

```bash
chmod +x scripts/start_portal.sh
PORT=3001 ./scripts/start_portal.sh
```

O script instala as dependências, cria um build limpo, confirma que
`.next/static` contém os assets JavaScript e inicia o servidor em `0.0.0.0`.
Para reutilizar uma instalação ou build já validado, podem ser definidos
`SKIP_INSTALL=true` e `SKIP_BUILD=true`.

O `Dockerfile.portal` cobre apenas este processo Node. A materialização S3 e os
restantes serviços pertencem a uma futura arquitetura de deployment, descrita em
[Operações](OPERATIONS.md#deployment-do-portal-piloto).

### Servidor privado com CloudFront (piloto)

A stack `BluCostaPortal` (`infra/aws-split-app.mjs`) publica o portal com
endereço próprio (saída `PortalUrl`):

- **Rede:** instância `t4g.small` numa sub-rede isolada da VPC de `BluCostaData`
  (a conta está no limite de VPCs), sem IP público nem NAT; o CloudFront chega-lhe
  por uma VPC origin na porta 8080. A entrada só aceita o grupo
  `CloudFront-VPCOrigins-Service-SG`, consultado depois da distribuição: a prefix
  list pública e o bloco da sub-rede não funcionam. A VPC origin exige um internet gateway ligado,
  que não tem rotas. A saída só alcança o S3 e o DynamoDB, por gateway endpoints.
- **Login:** `infra/portal/gate.mjs` serve `/auth/*`, valida o ID token Cognito do
  grupo da intranet e guarda-o num cookie `HttpOnly`. Só fundadores, curadores e
  marketing entram; dentro do portal ainda não há separação por perfil (quem
  entra vê o catálogo e as propostas). O Next.js escuta apenas em `127.0.0.1:3001`.
- **Build:** cada deploy com código novo lança o projeto CodeBuild `PortalBuild`,
  que junta `dmc-workspace`, `config`, `portal`, `etl`, os esquemas do assistente e
  o portão num pacote com Node 24. O servidor procura uma versão nova a cada
  2 minutos, confirma o SHA-256 e reinicia os serviços. Guarda as três últimas.
- **Dados:** volume EBS próprio montado em `/srv/blu/state`, semeado uma única vez
  a partir de `blu-portal-data.tar.gz` (se existir na raiz no momento do deploy) e
  copiado todos os dias às 03:00 UTC, com 7 cópias.

Sem internet no servidor, a meteorologia, o planeador do assistente e a tradução
de itinerários não respondem, e os PDFs em mandarim precisam ainda de uma fonte
CJK. O arranque, o atualizador e os serviços escrevem na consola da instância
(`aws ec2 get-console-output --latest`), a única janela sem SSM nem internet.

O script de arranque corre em cada arranque e é idempotente: alterá-lo só reinicia
o servidor. Trocar de servidor não é viável sem intervenção, porque a VPC origin
fica presa à instância e o disco de dados só liga a uma de cada vez. A conta do
curso para todas as instâncias de 6 em 6 horas e as inativas de hora a hora
(`iseg-ec2-autoshutdown-cleaner`); sem exceção aprovada, o portal só responde
depois de alguém voltar a ligar o servidor.
O `Dockerfile.curation` e a stack ECS definem uma alternativa de hosting,
sem dados operacionais na imagem. Não são o destino da operação individual no
Code Editor. Ver [Operações](OPERATIONS.md#alternativa-de-hosting-cloud).

`npm run check` acrescenta `format:check` a estas verificações e deve terminar sem
avisos antes de integrar alterações no portal.

Os testes de navegador, variáveis para armazenamento isolado e alternativa Edge
no Windows estão centralizados no [guia de testes](TESTING.md#testes-de-navegador).

## Mapa da proposta e ligações diretas (2026-10-27)

- **Mapa da proposta:** secção «Mapa da proposta» na proposta aberta
  (`src/components/ProposalMap.tsx`). Cada dia tem uma cor; os pontos são
  numerados pela ordem do roteiro e ligados por uma linha tracejada, que não é o
  trajeto na estrada. Segue o dia escolhido na navegação por dias.
- **Só coordenadas do catálogo** (`src/lib/proposal-map.ts`): pontos sem
  coordenadas numéricas válidas (vazias, texto ou 0,0) ficam numa lista à parte
  e nunca aparecem no mapa. O tempo livre não conta.
- **Contorno:** `GET /api/map-outlines` lê `dashboard/region.geojson`, o mesmo
  ficheiro do Observatório; o build do `BluCostaPortal` passou a incluí-lo (sem ele,
  o Observatório também falhava no servidor). A projeção está em
  `src/lib/map-projection.ts`, partilhada pelos dois mapas.
- **Ligações diretas:** `/#mapa` abre a proposta com o mapa aberto e
  `/leads?lead=BLU-…` abre esse contacto. O login do portão guarda o fragmento
  (`#mapa`) durante o login. A proposta em edição é a do navegador de quem a abre.

## Meteorologia e controlos HTML nativos

O navegador consulta `/api/weather` no próprio portal. O servidor chama
`portal/weather.py`, sem serviço adicional ou bibliotecas Python extra. Previsão
e referência histórica são identificadas separadamente. Uma falha ou resposta
incompleta não é substituída por temperaturas fixas. Precipitação ausente aparece
como «Por confirmar». A mesma consulta é reutilizada pela ferramenta do agente.

O painel de detalhes abre num popover HTML nativo. Pode ser fechado com Escape,
clique fora ou o botão Fechar. A consulta dinâmica continua a precisar de
JavaScript; a gestão de abertura e fecho é feita pelo navegador.

## Percursos em Python

O cálculo de um troço usa `portal/routing.py` através do adaptador local. Python
valida coordenadas, modo, margem e timeout, consulta OSRM e aplica uma estimativa
geométrica identificada quando o fornecedor não responde. A ordenação de pontos e
os resumos diários permanecem temporariamente no módulo TypeScript do editor.

Em `/exports`, **Enviar para o Lixo** usa um formulário HTML e funciona sem
JavaScript. Após o POST, o histórico é recarregado; erros aparecem no próprio
histórico. Os formulários exigem origem válida. A API JSON e o restauro no Lixo
interativo continuam disponíveis.

Em `/exports`, escolher o idioma e carregar em **Descarregar PDFs** ou **Exportar
TXT**. O formulário transmite versão, idioma e formato sem estado React e
funciona sem JavaScript. O ZIP preserva os PDFs da versão; o TXT continua a
excluir notas internas e contactos. PDF traduzido requer os modelos locais.

## Apresentação para utilização normal

A interface apresenta nomes, condições, fontes públicas e confirmações pendentes.
Códigos de regras, IDs do catálogo/viagem, posição do algoritmo de seleção, hashes
e ligações ao JSON de diagnóstico ficam fora dos ecrãs normais. Identificadores,
revisões e regras continuam nos contratos internos e nos snapshots. Os resumos
antigos gerados com códigos de regras são filtrados apenas na apresentação.

A página Referências misturava exploração técnica do dataset, linhagem de fontes e
referências históricas. Foi retirada da navegação; `/references` encaminha para
`/catalog`, conservando o prefixo SageMaker. O catálogo continua a apresentar
informação histórica útil e avisos de validade. A API de consulta de fontes e a
sua allowlist mantêm-se para os contratos e ferramentas internas; isto não altera
os controlos de acesso nem elimina os dados de origem.

Os novos PDFs apresentam versão legível, roteiro, condições e orçamento, sem os
IDs internos, hashes ou códigos das regras. PDFs já guardados continuam a ser
repetidos com os mesmos bytes. O contrato da ferramenta Prompt TXT permanece
independente e continua a excluir contactos e notas internas.

As traduções explícitas da interface são geradas a partir de `ui_sources.json` e
`ui_overrides.json`. `python3 translations/build_ui_catalogue.py --overrides-only`
atualiza as traduções explícitas sem executar modelos ou alterar as restantes.

### Isolar dados de testes

`BLU_DATA_DIR` define a pasta de fontes e a base `portal/catalog.sqlite`;
`BLU_WAREHOUSE_DIR` define a entrega publicada. O endpoint de publicação usa os
mesmos caminhos, permitindo testar edição e ETL sem tocar nas pastas reais.
Para versões e PDFs temporários, definir também `BLU_EXPORT_DIR`. As fontes
necessárias devem existir no diretório de dados escolhido.
`BLU_OPERATIONAL_DIR` pode colocar a fila temporária de versões noutra pasta;
sem configuração, usa `exports/portal-persistence/`. No SageMaker atual, estes
caminhos apontam para a cache reconstruível em `/tmp`; releases operacionais e
checkpoints S3 constituem a persistência permanente. No futuro deployment cloud,
o EFS previsto reduz a janela entre uma escrita local e a publicação S3. O JSON
pendente é removido apenas depois de a operação ficar registada no SQLite e pode
ser restaurado pelos backups do Monitoring.

## Resolução de problemas

O percurso preparado para demonstrações, incluindo os campos do botão
**Preencher exemplo**, os prompts do assistente e os resultados esperados, está
no [guião de demonstração](DEMO_CHATBOT_SCRIPT.md).

- **Warehouse indisponível:** executar o ETL a partir da raiz.
- **Catálogo vazio na geração:** aprovar registos e atualizar o catálogo para os
  itinerários.
- **Tradução indisponível:** sincronizar o grupo `translation` e executar
  `translations/setup_models.py`.
- **Conflito de versão:** reabrir a versão mais recente antes de guardar.
- **PDF mandarim sem fonte:** configurar `BLU_PDF_CJK_FONT`.
- **Dados locais ilegíveis:** não limpar o armazenamento antes de recuperar ou
  exportar as viagens existentes.

- **Geist ou stack frames com 404 no Studio:** reiniciar o servidor após alterar
  a configuração Next.js e atualizar a página sem cache. O loader de
  desenvolvimento aplica o prefixo aos caminhos internos do overlay Next 16.4;
  reavaliar esta adaptação quando atualizar o Next.js.
- **Atributos Grammarly no body:** a extensão acrescenta atributos antes da
  hidratação. O layout suprime apenas diferenças de atributos nesse elemento;
  os componentes descendentes continuam sujeitos à validação React.
- **React DevTools e HMR connected:** mensagens informativas de desenvolvimento.
