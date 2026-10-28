# Inicializar o projeto e abrir os dashboards

Guia único para preparar o BLU num SageMaker Code Editor novo ou num segundo Space e chegar às cinco interfaces. Os comandos são para Bash e assumem `eu-west-1`. O domínio do Studio é descoberto dinamicamente; não copiar o `studio-id`, `.aws/`, `.env`, contas ou cache de outro workspace.

Seguir as etapas pela ordem, no mesmo terminal remoto. Resolver erros antes de avançar. Uma execução anterior não comprova a instalação atual nem transfere autorizações.

## Ambiente AWS e editor de trabalho

| Termo neste guia | Significado |
| --- | --- |
| Space / workspace AWS | Ambiente SageMaker Studio cuja aplicação é Code Editor; aí correm código, processos e cache |
| VS Code remoto | Aplicação VS Code ligada ao ambiente AWS, usada para editar ficheiros e executar os comandos no terminal remoto |
| Code Editor web | Interface do mesmo ambiente aberta no navegador pela consola AWS; gere os encaminhamentos HTTPS usados pelos dashboards |

A instalação pode ser feita no terminal do **VS Code remoto** ou do editor web, desde que esteja ligado ao Space certo. Não executar estes comandos num terminal local do portátil. Não é necessário mudar de editor para preparar o projeto; a sessão web será necessária na etapa de abertura dos dashboards.

## 1. Acesso e clone

No terminal ligado ao ambiente AWS, confirmar Git, Python 3.12/3.13, acesso ao repositório e uma role IAM autorizada para os recursos do projeto. Confirmar a identidade sem partilhar a saída com credenciais:

```bash
git --version
python3 --version
aws sts get-caller-identity
```

STS confirma a identidade, não o acesso a S3, DynamoDB ou Bedrock.
Usar um branch já publicado com a versão a instalar. Não voltar a clonar nem substituir um clone existente:

```bash
cd "$HOME"
if [ ! -d gpaimlp_5ed_grupo4/.git ]; then
  read -r -p "Branch publicado a instalar: " BLU_INSTALL_BRANCH
  git clone --branch "$BLU_INSTALL_BRANCH" \
    https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4.git
fi
cd "$HOME/gpaimlp_5ed_grupo4"
git branch --show-current
git log -1 --oneline
git status --short
ls pyproject.toml uv.lock
```

Se a pasta tiver outro nome, ajustar o `cd`. Manter a raiz que contém `pyproject.toml` como diretório atual em todas as etapas. Não descartar trabalho local para obter um checkout limpo.

## 2. Selecionar Node 24

O projeto exige Node >=22.13 e <25; prefere Node 24 LTS. Verificar:

```bash
node --version
npm --version
```

Se `nvm` não estiver disponível, carregar uma instalação existente:

```bash
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi
command -v nvm
```

Se continuar ausente, instalar a versão fixada do gestor:

```bash
curl -fsSLo /tmp/nvm-install.sh \
  https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh
bash /tmp/nvm-install.sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
```

Selecionar e confirmar os executáveis:

```bash
nvm install 24
nvm use 24
nvm alias default 24
command -v node
command -v npm
node --version
npm --version
```

O npm incluído é suficiente. Não continuar com Node 20. Num novo terminal, voltar a carregar o nvm e selecionar a versão antes dos comandos do projeto.

## 3. Instalar e ativar Python

Na raiz do projeto:

```bash
python3 -m pip install --user uv==0.12.19
export PATH="$HOME/.local/bin:$PATH"
uv --version
uv sync --locked --all-groups
. .venv/bin/activate
python3 --version
```

Isto prepara ETL, dashboard, agente e tradução, mas não os modelos Argos ou a fonte CJK. Ativar `.venv` faz os comandos `python3` dos launchers usarem o ambiente do projeto. Não criar outro `pyproject.toml`, usar `uv init` ou editar requirements.
Se aparecer `No pyproject.toml found`, corrigir o diretório atual.

## 4. Configurar o Space e o acesso Monitoring

```bash
.venv/bin/python scripts/setup_workspace.py
.venv/bin/python scripts/setup_workspace.py --check-only
```

No Code Editor, o assistente usa metadados e `sagemaker:DescribeSpace`, instala **BLU Workspace Links**, prepara o launcher e cria o administrador Monitoring quando necessário. A descoberta tem de resolver o Space atual. Se falhar, confirmar a permissão; não contornar com uma URL antiga.

No primeiro acesso gerado, o utilizador é `admin`. Consultar a palavra-passe apenas no ficheiro local `monitoring/runtime/initial-password.txt`, pelo editor, e substituí-la depois de entrar. Não a copiar para chats, argumentos ou logs.
As contas existentes são preservadas; não usar a conta de outro workspace.

Fora do SageMaker, indicar a URL real explicitamente:

```bash
read -r -p "URL real até /codeeditor/default: " BLU_STUDIO_URL
.venv/bin/python scripts/setup_workspace.py --studio-url "$BLU_STUDIO_URL"
```

O texto `<studio-id>` não é uma URL. Não usar `--initialize-data` no onboarding S3: a materialização pertence ao protocolo de arranque.

## 5. Verificar os buckets e as releases

Estes são os buckets usados pelo projeto. Noutro ambiente, confirmar primeiro os nomes e prefixos aprovados; não os inferir nem usar marcadores de exemplo.

```bash
export AWS_REGION=eu-west-1
export DATA_BUCKET="blu-dmc-data-650557269385-eu-west-1"
export BACKUP_BUCKET="blu-dmc-backups-650557269385-eu-west-1"
export BLU_DATA_S3_BUCKET="$DATA_BUCKET"
export BLU_BACKUP_S3_BUCKET="$BACKUP_BUCKET"
export BLU_BACKUP_S3_PREFIX=blu-backups
export BLU_ENVIRONMENT=development

for prefix in development/sources/ development/warehouse/ development/operational/; do
  aws s3api list-objects-v2 --bucket "$DATA_BUCKET" --prefix "$prefix" \
    --max-keys 1 --query '{count:KeyCount,key:Contents[0].Key}'
done
aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" \
  --prefix blu-backups/development/checkpoint/ --max-keys 1 \
  --query '{count:KeyCount,key:Contents[0].Key}'
.venv/bin/python -B -m etl.s3_transport inventory sources
.venv/bin/python -B -m etl.s3_transport inventory warehouse
```

A role pode não ter `s3:ListAllMyBuckets`; não é necessário executar `list-buckets`.
Listagem autorizada não prova leitura dos objetos. O inventário deve encontrar uma release válida ativa; investigar `invalid` antes da recuperação. Um prefixo vazio, por si só, não garante dados recuperáveis. Não alargar IAM para diagnóstico.

## 6. Componentes AWS opcionais

Para verificar os metadados do perfil do assistente, sem gerar conteúdo:

```bash
aws bedrock get-inference-profile --region eu-west-1 \
  --inference-profile-identifier eu.amazon.nova-pro-v1:0 \
  --query '{status:status,id:inferenceProfileId}'
```

A consulta não comprova `bedrock-runtime:Converse`. Uma inferência real exige autorização e pode ter custo; não é necessária para abrir os dashboards.

Para contactos reais em Leads, configurar em conjunto `BLU_CONVERSATION_TABLE` e `BLU_INTELLIGENCE_TABLE` com os outputs Data aprovados, antes de guardar a configuração. Não inventar nomes. Sem as tabelas/permissões/endpoints corretos, a interface pode abrir sem a integração AWS estar operacional. A pré-visualização Vite na porta 5173 e o site público CloudFront são entradas diferentes.
Ver [ligação entre curadoria e Leads](OPERATIONS.md#ligação-entre-curadoria-e-leads).

## 7. Preparar tradução e fonte CJK

Esta etapa é opcional para abrir os dashboards, mas necessária para exportar PDFs traduzidos com os modelos locais. Prepará-la antes do primeiro arranque evita um worker iniciado sem modelos. Executar os downloads quando autorizados:

```bash
.venv/bin/python translations/setup_models.py
printf '%s\n' \
  '{"id":"smoke-pt-zh","target":"zh","items":[{"source":"pt","text":"Chegada ao hotel às 15:30."}]}' \
  | .venv/bin/python translations/worker.py
```

O resultado conserva o identificador e `15:30`. A qualidade da tradução exige revisão humana. Num Code Editor Ubuntu sem fonte CJK, preparar Noto Sans CJK:

```bash
mkdir -p "$HOME/.tools/pdf-cjk-validation"
(
  cd "$HOME/.tools/pdf-cjk-validation"
  apt-get download fonts-noto-cjk
  for archive in fonts-noto-cjk_*.deb; do
    dpkg-deb -x "$archive" extracted
  done
)
export BLU_PDF_CJK_FONT="$HOME/.tools/pdf-cjk-validation/extracted/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
export BLU_PDF_CJK_FACE=NotoSansCJKsc-Regular
```

A fonte é extraída sem instalação global e fica fora do Git. Não exportar `LD_LIBRARY_PATH` globalmente para os launchers.

## 8. Guardar a configuração local

O bloco seguinte preserva as restantes linhas do `.env`, grava as quatro chaves S3 e a região, e inclui os valores opcionais apenas quando exportados. Não copia segredos de outra instalação nem executa o `.env` como código:

```bash
.venv/bin/python - <<'CONFIG'
from pathlib import Path
import os
p = Path('.env')
text = p.read_text() if p.exists() else Path('.env.example').read_text()
required = ('AWS_REGION', 'BLU_DATA_S3_BUCKET', 'BLU_BACKUP_S3_BUCKET',
            'BLU_BACKUP_S3_PREFIX', 'BLU_ENVIRONMENT')
optional = ('BLU_PDF_CJK_FONT', 'BLU_PDF_CJK_FACE',
            'BLU_CONVERSATION_TABLE', 'BLU_INTELLIGENCE_TABLE')
keys = required + tuple(key for key in optional if os.environ.get(key))
lines = text.splitlines()
for key in keys:
    lines = [line for line in lines if not line.startswith(key + '=')]
    lines.append(key + '=' + os.environ[key])
p.write_text('\n'.join(lines) + '\n')
p.chmod(0o600)
CONFIG
git check-ignore -v .env
```

Manter a configuração e os downloads fora do Git. Os launchers carregam as chaves reconhecidas; valores já exportados no terminal têm prioridade.

## 9. Executar a inicialização integral

Confirmar primeiro autorização para os efeitos S3 do protocolo: checkpoint, recuperação e eventual publicação do estado operacional. Depois, na raiz:

```bash
./bin/just blu it
```

Introduzir a credencial do administrador Monitoring apenas no pedido interativo.
O protocolo protege o estado, para serviços, recupera/materializa dados, executa ETL e testes, instala dependências npm/Playwright, constrói e inicia os serviços.
Não é preciso instalar `node_modules` de outro workspace ou construir o portal manualmente antes desta etapa. Uma falha interrompe a etapa correspondente.

No fim, exigir tarefas concluídas e cinco endpoints saudáveis. O diagnóstico fica em `monitoring/runtime/recovery/just-blu-it.log`. Não copiar esse ficheiro inteiro sem verificar se contém informação privada da execução.
Os efeitos e limites estão em [Operações](OPERATIONS.md#recuperação-local).

## 10. Abrir os cinco dashboards no navegador

Manter aberto o **Code Editor web do mesmo Space**, na consola AWS. A integração instalada usa o encaminhamento nativo dessa sessão. O VS Code remoto pode continuar aberto para editar código e usar o terminal, mas a sua sessão não substitui o registo das portas no editor web.

1. Se for a primeira instalação da extensão, executar **Developer: Reload Window** na paleta de comandos e aguardar a reabertura do editor.
2. Usar **BLU · Interfaces** na barra inferior ou **BLU: Abrir interfaces deste workspace** na paleta.
3. Confirmar a abertura de cada interface:

| Interface | Porta | Verificação visual |
| --- | --- | --- |
| Curation Studio | 3001 | Página do portal e navegação do catálogo |
| Leads / Concierge | 5173 | Site e abertura do painel Talk to BLU |
| Apresentação | 3003 | Pitch comercial de seis momentos, para viajantes e parceiros |
| Monitoring | 3004 | Login e acesso com a conta local |
| Observatório | 8501 | Dashboard Streamlit com dados da entrega |

As portas seguem `config/workspace_interfaces.json`; o agente não tem porta própria. Para mostrar os endereços atuais ou repetir a abertura:

```bash
.venv/bin/python scripts/open_dashboards.py --print-only
.venv/bin/python scripts/open_dashboards.py
```

Se a sessão web não confirmar, o segundo comando pode terminar com código 3.
Isso significa **abertura pendente**, não falha dos serviços. Regressar ao editor web do Space e usar a paleta. Se necessário, adicionar as portas no painel Ports **dessa sessão web** e abrir as ligações resolvidas, mantendo o acesso privado.
O painel Ports do VS Code remoto mostrar `localhost` é normal; comprova o túnel dessa sessão, não o registo no proxy HTTPS do Code Editor web.

Se a integração não estiver instalada, repetir a instalação local e recarregar a janela web:

```bash
.venv/bin/python scripts/install_code_editor_links.py
```

Não substituir o domínio por outro `studio-id` nem tornar as portas públicas para contornar uma sessão expirada. Renovar a sessão pela consola AWS quando necessário.

## 11. Verificação final e problemas frequentes

```bash
.venv/bin/python scripts/setup_workspace.py --check-only
python3 scripts/check_project.py
./bin/just blu up
```

O arranque rápido mantém serviços ativos, inicia os parados e pede as cinco interfaces. Não recupera dados, não cria checkpoints e não substitui o primeiro `blu it` quando a cache está ausente.

Se foi preparada a fonte CJK, o teste PDF pode agora usar as dependências npm instaladas pelo protocolo:

```bash
node --experimental-strip-types --test dmc-workspace/tests/pdf-presentation.test.mjs
```

| Sintoma | Ação |
| --- | --- |
| `No pyproject.toml found` | Entrar na raiz do clone; não executar `uv init` |
| `nvm: command not found` ou Node 20 | Carregar/instalar nvm e selecionar Node 24 |
| Nome de bucket inválido | Usar os nomes reais da etapa 5, sem marcadores `<...>` |
| `AccessDenied` em metadados | Confirmar ação e recurso; STS não prova permissões |
| Serviços saudáveis mas dashboards não abrem | Recarregar a extensão e abrir na sessão Code Editor web |
| URLs de outro Space | Corrigir a descoberta; não copiar configuração antiga |
| Tradução indisponível após instalar modelos | Reiniciar apenas o Portal para substituir o worker |
| Teste final da apresentação falha | Consultar o erro e repetir o teste isolado com o ambiente browser preparado; não repetir S3 apenas para diagnosticar |
| Linhas de progresso repetidas | Confirmar versão da barra adaptativa e largura; repetição visual não prova dados duplicados |

Guardar branch/commit e resultado da instalação, sem passwords, contactos ou PDFs de clientes. Ensaiar guardar/reabrir e exportar com dados sintéticos isolados, conforme [Testes](TESTING.md), e rever o PDF antes da entrega real.
O Git não recupera trabalho que nunca chegou a uma release ou checkpoint S3.

## 12. Utilização nos dias seguintes

Num novo terminal, entrar no clone e carregar as ferramentas:

```bash
cd "$HOME/gpaimlp_5ed_grupo4"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24
. .venv/bin/activate
./bin/just blu up
```

Usar `blu it` apenas para recuperação integral autorizada. Instalar modelos ou fontes depois de o Portal estar ativo exige reiniciar o seu processo; um refresh do navegador não recarrega o worker. As credenciais Monitoring continuam locais, os rascunhos ficam no navegador e a persistência autoritativa vem das releases S3.
