# Preparar um novo ambiente BLU

Este guia reproduz a configuração do sistema num SageMaker Code Editor novo sem
partilhar palavras-passe, tokens ou a URL privada de outra pessoa.

## Pré-requisitos de acesso

Antes da instalação, assegurar:

- acesso ao repositório Git;
- workspace SageMaker Code Editor próprio;
- uma função IAM com as permissões Bedrock exigidas pelo Agente IA;
- Python 3.12 ou 3.13, Node 24 LTS, npm, Git e `uv` 0.12.19;
- acesso IAM autorizado aos buckets de dados e backups do ambiente.

As permissões AWS e o acesso ao repositório são provisionados fora deste projeto.
Não copiar `.aws/`, `.env`, `monitoring/runtime/` ou credenciais entre utilizadores.

## Preparação inicial

Depois de clonar o repositório e entrar na respetiva raiz, copiar do endereço do
Code Editor apenas a parte terminada em `/codeeditor/default`. Não incluir
`/ports/...`, parâmetros nem tokens.

```bash
python3 -m pip install --user uv==0.12.19
export PATH="$HOME/.local/bin:$PATH"
uv sync --locked --all-groups
.venv/bin/python scripts/setup_workspace.py \
  --studio-url "https://<studio-id>.studio.eu-west-1.sagemaker.aws/codeeditor/default"
```


```bash FDC
uv run  python -B -m monitoring.setup

python3 -m pip install --user uv==0.12.19
export PATH="$HOME/BLU/bin:$PATH"
uv sync --locked --all-groups
uv run python scripts/setup_workspace.py --studio-url "https://ekg16an0qsybxru.studio.eu-west-1.sagemaker.aws/codeeditor/default" --initialize-data
```
O assistente:

1. valida a URL e guarda-a em `config/studio.local.json`, fora do Git;
2. confirma as versões de Python, Node, npm, `uv` e Git;
3. instala o launcher `just` em `~/.local/bin`;
4. cria o primeiro administrador do Monitoring quando ainda não existem contas;
5. confirma a estrutura do checkout; os dados não precisam de existir localmente;
6. deixa a materialização das releases S3 autorizadas para o launcher.

`--initialize-data` existe apenas para desenvolvimento local legado e exige uma
fonte e um warehouse já materializados. Não o usar no onboarding normal S3.

Se `just` não for encontrado na mesma sessão, acrescentar `~/.local/bin` ao `PATH`
ou abrir um terminal novo. O acesso inicial gerado fica temporariamente em
`monitoring/runtime/initial-password.txt`, com permissões locais restritas. Depois
do primeiro login, criar as contas pessoais em **Gerir utilizadores** e substituir
o acesso inicial.

Para repetir apenas o diagnóstico:

```bash
# FDC python3 scripts/setup_workspace.py --check-only
uv run python scripts/setup_workspace.py --studio-url "https://ekg16an0qsybxru.studio.eu-west-1.sagemaker.aws/codeeditor/default" --check-only
```

## Construção e arranque

Com os pré-requisitos resolvidos:

```bash
./bin/just blu it
```

Este comando autentica o administrador, cria e confirma um checkpoint remoto
quando existe estado a preservar, para os serviços e materializa a cache a partir
desse checkpoint ou das releases do bucket de dados. Depois prepara dependências,
testa, constrói o Portal, inicia os cinco serviços e abre as quatro interfaces.
Nos arranques seguintes basta:

```bash
just blu up
```
> - Este comando mantém os serviços ativos, inicia os que estejam parados, confirma os cinco endpoints e abre as quatro interfaces web.
  >    - 01  AGENTE IA            ● ONLINE    8000       1 ms
  >    - 02  OBSERVATÓRIO         ● ONLINE    8501       1 ms
  >    - 03  APRESENTAÇÃO         ● ONLINE    3003       0 ms
  >    - 04  MONITORING           ● ONLINE    3004       0 ms
  >    - 05  CURATION STUDIO      ● ONLINE    3001       3 ms
  >    - NETWORK READINESS      ━━━━━━━  100%
  >    - Codex CLI não instalado; os serviços BLU continuam ativos.
  >    - A porta técnica 8000 é validada, mas não abre um separador.

As portas esperadas são 3001, 3003, 3004, 8000 e 8501. A configuração versionada
em `.vscode/settings.json` encaminha-as silenciosamente; a porta 8000 é técnica e
não abre um separador.

  
> - **Descrição do processo**
- Antes do arranque, recupera ficheiros em falta do último backup verificado e guarda uma nova cópia em `/home/blu-system-backups/sagemaker-user` neste ambiente
(por defeito, `blu-system-backups/<nome-do-projeto>` ao lado do projeto).
- É possível escolher outro destino fora do projeto com `BLU_BACKUP_DIR`.
- O destino deve permitir escrita pelo utilizador que executa o comando.
- As cópias incluem `data/`, `warehouse/`, `exports/` e ficheiros JSON, JSONL e SQLite persistentes diretamente em `monitoring/runtime/`, incluindo contas.
- São privadas, verificadas por SHA-256 e acumuladas sem eliminação automática.
- SQLite usa a API de backup para incluir transações confirmadas no WAL.
- Ficheiros existentes têm prioridade; dados em falta são recuperados sem repetir o ETL. Rascunhos do navegador, dependências, builds e credenciais AWS não entram nestas cópias. 
- Uma cópia com serviços ativos não garante uma transação conjunta
entre catálogo e exports; evitar edições durante o comando.



O painel **Ports** do VS Code apresenta `localhost` na coluna de encaminhamento
porque mostra o extremo local do túnel. Os nomes identificam agora as interfaces
AWS. Para obter os endereços públicos SageMaker, executar **Tasks: Run Task →
BLU: Mostrar URLs AWS**; **BLU: Abrir dashboards AWS** abre diretamente as quatro
interfaces públicas configuradas em `config/studio.local.json`.

## Estado local e transferência

O Git fornece código, configuração partilhável e lockfiles. As fontes, o
warehouse, o catálogo, as versões e os PDFs são recuperados dos buckets
autorizados para uma cache em `/tmp`; não devem ser copiados para o repositório.
`monitoring/runtime/` permanece local porque contém contas, sessões e logs do
ambiente. As contas do Monitoring devem ser criadas novamente em cada instalação;
não transferir hashes ou palavras-passe como método normal de onboarding.

## Verificação final

```bash
python3 scripts/setup_workspace.py --check-only
python3 scripts/check_project.py
just blu up
```

O ambiente está pronto quando os cinco endpoints aparecem `ONLINE`, as quatro
interfaces abrem e o Monitoring aceita a conta pessoal do colega.

## Ficheiros incluídos no repositório para desenvolvimento

O clone inclui código, fixtures sintéticas de teste, os lockfiles, o launcher
`bin/just`, `config/studio.example.json` e `.env.example`. Não requer ficheiros da
pasta pessoal de quem criou o projeto. O `.env.example` documenta os valores
predefinidos do agente; copiá-lo para `.env` é opcional. Cada sessão usa a sua
função IAM, sem copiar chaves AWS. Node e Python são pré-requisitos de sistema;
`node_modules`, `.venv`, navegadores e bibliotecas são instalados pelos comandos.

Este fluxo aplica-se também aos branches de desenvolvimento: o estado operacional
é materializado do S3 autorizado, sem incluir as contas de outra instalação. O Git
não aplica regras de exclusão por branch;
um ficheiro publicado num branch continua no histórico se for depois removido.

Para começar num ambiente independente, usar prefixos S3 próprios e criar contas
novas. Trabalho que nunca tenha sido publicado numa release ou checkpoint não pode
ser reconstituído pelo launcher.
