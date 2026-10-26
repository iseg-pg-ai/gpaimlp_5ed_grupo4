# DMC Workspace

O DMC Workspace é o portal operacional usado pelo consultor ou curador para recolher o
briefing, consultar e manter o catálogo, gerar itinerários, acompanhar
confirmações e exportar propostas versionadas.

## Instalação e execução

Executar primeiro o ETL na raiz do repositório. Depois:

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001).

Para exportar PDFs traduzidos, preparar também o ambiente Python na raiz:

```powershell
python -m uv sync --locked --inexact --group translation
python translations/setup_models.py
```

Os modelos são executados localmente. Não é necessário iniciar um serviço Python
separado nem fornecer credenciais externas.

## Aparência

O botão com lua/sol no cabeçalho alterna entre os temas claro e escuro.
O tema claro é o padrão; a preferência fica guardada neste navegador e
sincroniza entre separadores. A impressão e os PDFs mantêm a apresentação
clara. O tema do portal não altera o dashboard Streamlit original.

Validar a alternância, persistência, contraste e adaptação ao ecrã com
`npm run test:theme` em `dmc-workspace/`, com o portal em execução.

## Fluxo funcional

1. Criar uma viagem e completar as etapas Cliente, Viagem, Preferências,
   Restrições e Rever.
2. Gerar uma proposta a partir dos registos aprovados e das regras de curadoria.
3. Rever os dias, os horários propostos, as fontes e as pendências.
4. Completar e guardar os dados de confirmação de cada atividade.
5. Usar o assistente para alterações explícitas que respeitam atividades
   protegidas ou confirmadas.
6. Escolher o idioma do cliente e exportar a versão portuguesa e a variante
   traduzida.

## Catálogo

O **Observatório interativo** é uma versão nativa da análise, com o estilo do
portal: Panorama, Explorar oferta, Destinos, Preços, Histórico e Qualidade.
Usa `/api/observatory` e a ponte Python existente para ler o warehouse numa
transação SQLite, sem nova persistência e sem depender do serviço Streamlit.
A aplicação original em `dashboard/` e o seu arranque permanecem inalterados.

O mapa permite deslocação, zoom, camadas, nomes dos lugares e agrupamento visual
que se adapta ao zoom. Selecionar um ponto abre a ficha; os membros de um grupo
podem ser escolhidos individualmente. Registos sem coordenadas continuam na
lista. Os contornos reutilizam o recurso Natural Earth existente, em domínio
público, sem pedidos a fornecedores cartográficos.

A comparação aceita duas a quatro ofertas, sem calcular um vencedor ou somar
preços. A mediana de preços exige a mesma categoria, unidade harmonizada,
condições originais, natureza comercial e moeda. Ausências não são zeros.
O histórico conta roteiros distintos e liga atrações apenas pelo identificador
explícito, sem inferir correspondências por nome. Não representa vendas.

A confirmação e a validade dos campos são reavaliadas através dos contratos
partilhados do ETL à data da consulta. Os indicadores distinguem preenchimento,
evidência e integridade; nenhum certifica disponibilidade ou compatibilidade.
As análises representam a entrega publicada e não as edições por publicar.
**Atualizar análise** relê a entrega após uma publicação, preservando os filtros.

**Gerir catálogo** mantém o editor operacional. Alternar entre as duas vistas
preserva a sessão de exploração e o formulário em curso enquanto a página
permanecer aberta. Em caso de indisponibilidade analítica, é possível tentar
novamente ou continuar no editor.

Validação: `npm run test:observatory`, com o portal iniciado, verifica as seis
áreas e as interações com o warehouse local. O teste usa tradução simulada e
simula uma falha do endpoint para verificar a recuperação; não guarda registos.

A página `/catalog` permite pesquisar, filtrar, criar, editar e inativar
atividades, restaurantes e experiências. Os registos seguem os estados Rascunho,
Em revisão, Aprovado e Inativo. Apenas os aprovados podem entrar na geração.

A persistência do catálogo usa SQLite Python e mantém o esquema existente.
As validações de entrada são partilhadas com o editor em TypeScript; cada edição
é guardada com verificação de revisão numa transação. Uma edição concorrente
obsoleta devolve conflito 409 e exige reabrir o registo.

O editor guarda a oferta e o histórico em `data/portal/catalog.sqlite`. O ETL
publica os registos aprovados no warehouse; não se deve editar `warehouse/`
manualmente. Os preços estruturados incluem valor, moeda, unidade e estado
Confirmado, Estimado ou Por confirmar. Zero representa explicitamente um serviço
gratuito.

Os campos de compatibilidade ligam a oferta às respostas estruturadas do
briefing. Correspondências desconhecidas não são convertidas em compatibilidade
automática.

## Geração e horários

A geração usa o destino, as datas, o ritmo, os interesses, as exclusões, o esforço,
o nível da proposta e a personalização. Distribui a oferta entre as três categorias
quando existem registos elegíveis.

Horários de funcionamento e durações reconhecidos permitem propor intervalos sem
sobreposição. Encerramentos ou formatos ambíguos deixam a atividade Por agendar.
As margens de deslocação são estimativas e não correspondem a percursos medidos.
Uma proposta não equivale a reserva ou confirmação do fornecedor.

## Confirmações

Em **Dados e confirmações**, o curador pode registar horário, local, preço,
fornecedor, referência, contacto e evidência. Os dados existentes no catálogo são
preenchidos automaticamente; alterações específicas da viagem têm precedência.

**Guardar progresso** cria uma versão com os dados parciais. **Confirmar
atividade** exige os campos e evidências aplicáveis. A confirmação é manual e não
contacta o fornecedor. Atividades protegidas ou confirmadas não podem ser removidas
pelo assistente.

## Logística da viagem

O briefing guarda o ponto, a hora e o número de voo de chegada e partida. Horas
e voos são opcionais para preservar propostas antigas e podem ser completados
mais tarde. Estes dados acompanham o snapshot da versão, o resumo de revisão e o
PDF; não são inferidos nem substituídos pelo ETL ou pelo assistente.

## Assistente

O assistente aceita comandos explícitos em português:

```text
adicionar "nome exato ou identificador do catálogo" ao dia 1
substituir atividade 1 do dia 1 por "nome exato ou identificador do catálogo"
reagendar atividade 1 do dia 1 para 14:00
reorganizar dia 1 na ordem 2,1,3
remover atividade 1 do dia 1
remover última atividade do dia 1
```

O comando `Ajuda` apresenta os formatos disponíveis. Pedidos incompatíveis com o
briefing, o orçamento, os horários ou as proteções são recusados com uma explicação.
As alterações manuais e as propostas aceites do Blu guardam a respetiva origem,
sem bloquear o dia. O bloqueio continua a ser uma escolha explícita do curador.
Regenerar um dia preserva atividades alteradas manualmente; remover, substituir,
reagendar ou mover uma atividade específica continua sujeito à revisão e aceitação.

## Exportação e versões

As versões são imutáveis e sequenciais por viagem. Durante a execução, o histórico
é materializado em `BLU_EXPORT_DIR/history.sqlite`; os PDFs e JSON de suporte ficam
sob o mesmo diretório. A release operacional ativa no S3 é a persistência
permanente, e os checkpoints do `just blu it` protegem a recuperação integral.

O painel reúne a versão atual, o idioma do cliente, a exportação e o histórico. A
exportação entrega português e o idioma escolhido no mesmo ZIP. Variantes
linguísticas pertencem à mesma versão e reutilizam os bytes já guardados.
Alterações posteriores ao catálogo não modificam snapshots ou PDFs antigos.

O orçamento discriminado apresenta preços calculáveis, valores por confirmar e
totais separados por moeda. O orçamento disponível do cliente aparece separado do
custo conhecido da proposta. Valores desconhecidos não são apresentados como zero.

## Partilha com o cliente

O botão **Partilhar** abre um painel para escolher a versão, o idioma e a forma de
entrega. A ligação de acesso apresenta uma página simples da proposta; a opção
Documento PDF abre diretamente o PDF imutável dessa versão e idioma. O email do
cliente vem do briefing e pode ser alterado antes de preparar a mensagem.

O portal abre o programa de email do computador com destinatário, assunto, texto e
ligação preenchidos. O envio é confirmado nessa aplicação. As ligações ficam
guardadas no histórico SQLite de exportações. Em instalações acessíveis fora do
computador local, `BLU_PUBLIC_URL` deve conter a origem pública do portal, por
exemplo `https://propostas.example.com`.

## Planos ativos e Lixo

O ícone de lixo de cada viagem na barra lateral retira a viagem dos planos ativos
sem eliminar o seu briefing, roteiro, mensagens ou referência à versão. A página
**Lixo** permite pesquisar as viagens removidas, consultar a data e distinguir a
remoção manual da automática. A opção automática move apenas viagens cuja data de
fim seja anterior ao dia atual.

Cada versão no histórico tem uma ação própria para a enviar para o Lixo. Isto não
remove a viagem nem uma atividade do roteiro. As versões removidas deixam de surgir
no histórico ativo, mas os snapshots, PDFs e variantes linguísticas permanecem no
SQLite e podem ser restaurados na página Lixo. A remoção de uma atividade continua
a ser feita no cartão do respetivo dia e cria uma nova versão do roteiro.

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

### Apresentação dos PDFs BLU

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

Não foram incluídas fotografias: o repositório não contém fotografias de destinos
com autorização documentada. A introdução de fotografias fica dependente desses
materiais e respetivos créditos. A decoração geométrica da capa é desenhada
diretamente no PDF.

## TXT para Canva

O contrato atual é `blu-roteiro-canva/1.1.0`; o plugin local 0.4.0 aceita também
TXT 1.0.0. O idioma escolhido aplica-se ao TXT e aos PDFs.

1. Rever o roteiro e escolher o idioma do cliente.
2. Clicar **Exportar TXT para Canva**. O portal guarda uma versão antes do download.
   As versões anteriores também têm ligação TXT no histórico.
3. Abrir [BLU | Roteiros no Canva](https://chatgpt.com/plugins/Plugin_600e0d208a74819191cafc6c69a90579)
   e anexar o TXT. A ligação ao Canva deve estar autorizada.
4. Rever a composição numa cópia do
   [modelo BLU](https://canva.link/5u8zxudd1vkcbth), mantendo o original intacto.
5. Aprovar a pré-visualização e exportar o PDF com as ferramentas disponíveis no
   Canva; caso não exista exportação na integração, usar o editor Canva.

O TXT contém instruções e dados JSON da versão guardada, não um PDF nem uma
tradução já realizada. O plugin recebe a orientação do idioma e compõe o texto.
Mantém preços, moedas, restrições e pendências; exclui contactos, referências de
reserva e notas internas, mas inclui o nome do cliente. A partilha é manual.
Descarregar TXT não altera os PDFs persistidos nem o estado de exportação PDF.
O visual segue LISBON IN PERSPECTIVE (672 x 1056), com os PDFs atuais como base
de estrutura. Os exemplos do modelo não são dados da nova proposta.

O histórico global de versões também oferece TXT por idioma. Versões no Lixo
devem ser restauradas antes da exportação. O TXT inclui períodos livres,
personalização estruturada, capacidade diária e resumos de deslocações guardados.
As rotas continuam estimativas sujeitas a revisão; a meteorologia consultada
dinamicamente não pertence ao snapshot e não é incluída no TXT.

A partilha integrada continua a entregar o PDF DMC da versão selecionada.
O PDF Canva é uma entrega independente aprovada pelo curador; não substitui
artefactos históricos, não atualiza ligações públicas e não marca a versão
como PDF exportado no portal. Alterar o roteiro exige exportar a nova versão
antes de adaptar a composição Canva. Atualizar instruções do plugin exige
reconstruir/importar o pacote; anexar um novo TXT não atualiza a instalação.

## Idiomas

A interface suporta português, inglês, mandarim, espanhol, francês e alemão. Os
textos livres dos PDFs são traduzidos localmente. Para mandarim, pode ser necessário
configurar `BLU_PDF_CJK_FONT` e, para ficheiros TTC, `BLU_PDF_CJK_FACE`.

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
mantidas no `localStorage` do navegador. Não existe autenticação própria nem
sincronização multiutilizador.

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

A base pública local está em `config/studio.local.json`. Sem override,
`scripts/start_aws_portal.sh` usa essa origem; `PORTAL_PUBLIC_ORIGIN` explícito
continua a ter prioridade. Listar as ligações dos dashboards com
`python -B scripts/studio_urls.py` na raiz.

O proxy do Code Editor acrescenta um prefixo ao endereço. Usar o script
específico, a partir da raiz, com a origem HTTPS da instância do utilizador:

```bash
cd dmc-workspace
npm ci
cd ..
PORTAL_PUBLIC_ORIGIN=https://DOMINIO-DO-TEU-STUDIO bash scripts/start_aws_portal.sh
```

Abrir `https://DOMINIO-DO-TEU-STUDIO/codeeditor/default/ports/3001/`.
Substituir o domínio pelo da própria instância. O script recompila com o prefixo
antes de iniciar; um build criado sem esse prefixo não serve para este proxy.
Requer Node 22.13 a 24.x; preserva uma versão compatível já selecionada.
O serviço HTTP do agente Python é opcional. Para o iniciar com o portal, acrescentar
`BLU_START_AGENT=1` ao comando, depois de preparar as dependências Python.

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

- **Rede:** instância `t4g.small` numa sub-rede isolada, sem IP público nem NAT;
  o CloudFront chega-lhe por uma VPC origin na porta 8080. A saída só alcança o
  S3 e o DynamoDB, por gateway endpoints.
- **Login:** `infra/portal/gate.mjs` serve `/auth/*`, valida o ID token Cognito do
  grupo da intranet e guarda-o num cookie `HttpOnly`. Só fundadores e curadores
  entram; o Next.js escuta apenas em `127.0.0.1:3001`.
- **Build:** cada deploy com código novo lança o projeto CodeBuild `PortalBuild`,
  que junta `dmc-workspace`, `config`, `portal`, `etl`, os esquemas do assistente e
  o portão num pacote com Node 24. O servidor procura uma versão nova a cada
  2 minutos, confirma o SHA-256 e reinicia os serviços. Guarda as três últimas.
- **Dados:** volume EBS próprio montado em `/srv/blu/state`, semeado uma única vez
  a partir de `blu-portal-data.tar.gz` (se existir na raiz no momento do deploy) e
  copiado todos os dias às 03:00 UTC, com 7 cópias.

Sem internet no servidor, a meteorologia, o planeador do assistente e a tradução
de itinerários não respondem, e os PDFs em mandarim precisam ainda de uma fonte
CJK. O arranque fica registado na consola da instância
(`aws ec2 get-console-output`).

`npm run check` acrescenta `format:check` a estas verificações e deve terminar sem
avisos antes de integrar alterações no portal.

Os testes de navegador, variáveis para armazenamento isolado e alternativa Edge
no Windows estão centralizados no [guia de testes](TESTING.md#testes-de-navegador).

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

Em `/exports`, escolher o idioma e carregar em **Descarregar PDFs** ou **TXT para
Canva**. O formulário transmite versão, idioma e formato sem estado React e
funciona sem JavaScript. O ZIP preserva os PDFs da versão; o TXT continua a
excluir notas internas e contactos. PDF traduzido requer os modelos locais.

## Consulta das fontes em HTML

Em `/references`, escolher a folha, escrever a pesquisa e carregar em **Filtrar**.
A seleção e a pesquisa ficam no URL; os links Anterior/Seguinte conservam os
filtros. O formulário, a paginação e os detalhes funcionam sem JavaScript.
A tradução da interface continua disponível quando JavaScript está ativo.

A pesquisa e o enriquecimento de fontes usam `portal/data.py`; a composição
TXT/Canva usa `portal/prompt.py`. Ambos usam apenas a biblioteca
padrão Python. O portal usa `BLU_PYTHON`, o ambiente `.venv` ou o Python do sistema,
por esta ordem. Não é necessário iniciar o agente ou outro servidor. Os registos
são renderizados pelo template `dmc-workspace/templates/dataset-row.html`, com
escaping das fontes; valores vazios aparecem como «—».

### Isolar dados de testes

`BLU_DATA_DIR` define a pasta de fontes e a base `portal/catalog.sqlite`;
`BLU_WAREHOUSE_DIR` define a entrega publicada. O endpoint de publicação usa os
mesmos caminhos, permitindo testar edição e ETL sem tocar nas pastas reais.
Para versões e PDFs temporários, definir também `BLU_EXPORT_DIR`. As fontes
necessárias devem existir no diretório de dados escolhido.
`BLU_OPERATIONAL_DIR` pode colocar a fila temporária de versões noutro volume;
sem configuração, usa `exports/portal-persistence/`. Em produção, estes três
diretórios operacionais devem ser montados fora do filesystem efémero do
container. O JSON pendente é removido apenas depois de a operação ficar registada
no SQLite e pode ser restaurado pelos backups do Monitoring.

## Resolução de problemas

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
