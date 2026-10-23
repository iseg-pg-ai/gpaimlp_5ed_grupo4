# Preparar um novo ambiente BLU

Este guia reproduz a configuração do sistema num SageMaker Code Editor novo sem
partilhar palavras-passe, tokens ou a URL privada de outra pessoa.

## Pré-requisitos de acesso

Antes da instalação, cada colega precisa de:

- acesso ao repositório Git;
- um espaço SageMaker Code Editor próprio;
- uma função IAM com as permissões Bedrock exigidas pelo Agente IA;
- Python 3.12 ou 3.13, Node 24 LTS, npm, Git e `uv` 0.12.19;
- acesso autorizado às fontes e exports operacionais que não estejam no Git.

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
.venv/bin/python scripts/setup_workspace.py --initialize-data \
  --studio-url "https://<studio-id>.studio.eu-west-1.sagemaker.aws/codeeditor/default"
```

O assistente:

1. valida a URL e guarda-a em `config/studio.local.json`, fora do Git;
2. confirma as versões de Python, Node, npm, `uv` e Git;
3. instala o launcher `just` em `~/.local/bin`;
4. cria o primeiro administrador do Monitoring quando ainda não existem contas;
5. confirma a presença dos ficheiros versionados necessários;
6. com `--initialize-data`, cria o catálogo a partir do warehouse e a pasta vazia
   de itinerários, preservando instalações existentes válidas.

Se `just` não for encontrado na mesma sessão, acrescentar `~/.local/bin` ao `PATH`
ou abrir um terminal novo. O acesso inicial gerado fica temporariamente em
`monitoring/runtime/initial-password.txt`, com permissões locais restritas. Depois
do primeiro login, criar as contas pessoais em **Gerir utilizadores** e substituir
o acesso inicial.

Para repetir apenas o diagnóstico:

```bash
python3 scripts/setup_workspace.py --check-only
```

## Construção e arranque

Com os pré-requisitos resolvidos:

```bash
./bin/just blu it
```

Este comando autentica o administrador, prepara todas as dependências bloqueadas e
trata os dados locais antes dos testes. Num clone sem catálogo, itinerários ou
backups, cria o catálogo a partir do warehouse versionado e uma área de itinerários
vazia. Numa instalação existente, preserva os conjuntos válidos e recupera os
restantes apenas de um backup verificado. Depois constrói o Portal, inicia os cinco
serviços e abre as quatro interfaces. Nos arranques seguintes basta:

```bash
just blu up
```

As portas esperadas são 3001, 3003, 3004, 8000 e 8501. A configuração versionada
em `.vscode/settings.json` encaminha-as silenciosamente; a porta 8000 é técnica e
não abre um separador.

O painel **Ports** do VS Code apresenta `localhost` na coluna de encaminhamento
porque mostra o extremo local do túnel. Os nomes identificam agora as interfaces
AWS. Para obter os endereços públicos SageMaker, executar **Tasks: Run Task →
BLU: Mostrar URLs AWS**; **BLU: Abrir dashboards AWS** abre diretamente as quatro
interfaces públicas configuradas em `config/studio.local.json`.

## Estado local e transferência

O Git fornece código, fontes versionadas e a entrega atual de `warehouse/`. Estes
elementos são específicos de cada ambiente e precisam de backup ou transferência
autorizada quando seja necessário preservar trabalho anterior:

- `data/portal/catalog.sqlite`: catálogo editável e revisões;
- `exports/`: propostas, versões e PDFs;
- `monitoring/runtime/`: contas, logs, backups e estado operacional.

Uma instalação nova pode começar sem estes conjuntos; o primeiro `just blu it`
inicializa o catálogo e a estrutura de versões. Para continuar trabalho existente,
transferir cada conjunto pelo canal aprovado pela organização. As contas do
Monitoring devem ser criadas novamente para cada instalação; não transferir hashes
ou palavras-passe como método normal de onboarding.

## Verificação final

```bash
python3 scripts/setup_workspace.py --check-only
python3 scripts/check_project.py
just blu up
```

O ambiente está pronto quando os cinco endpoints aparecem `ONLINE`, as quatro
interfaces abrem e o Monitoring aceita a conta pessoal do colega.

## Ficheiros incluídos no repositório para desenvolvimento

O clone inclui fontes em `data/`, o warehouse publicado, os lockfiles, o launcher
`bin/just`, `config/studio.example.json` e `.env.example`. Não requer ficheiros da
pasta pessoal de quem criou o projeto. O `.env.example` documenta os valores
predefinidos do agente; copiá-lo para `.env` é opcional. Cada sessão usa a sua
função IAM, sem copiar chaves AWS. Node e Python são pré-requisitos de sistema;
`node_modules`, `.venv`, navegadores e bibliotecas são instalados pelos comandos.

Este fluxo aplica-se também aos branches de desenvolvimento: o estado inicial é
recriado a partir dos ficheiros versionados, sem incluir as contas e o histórico
operacional de outra instalação. O Git não aplica regras de exclusão por branch;
um ficheiro publicado num branch continua no histórico se for depois removido.

Para começar com dados locais independentes, não copiar `catalog.sqlite`, exports
ou contas existentes. Para continuar propostas anteriores, é necessária uma
transferência autorizada dos respetivos dados e versões; a inicialização não
reconstitui trabalho que nunca foi publicado no Git ou num backup.
