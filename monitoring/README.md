# BLU Operations — monitoring privado

Painel independente do portal, Observatório e apresentação, na porta **3004**.
Usa apenas Python 3.12/3.13 e a biblioteca padrão. Não exige o grupo `agent`.
Interface e API de estado exigem login próprio; o CSS da página de login é público.

## Preparar e iniciar

Na raiz do repositório, definir credenciais interativamente:

```bash
python -B -m monitoring.setup
python -B -m monitoring.server
```

Para um primeiro acesso gerado localmente:

```bash
python -B -m monitoring.setup --generate
```

Esse modo cria o utilizador `admin` e uma palavra-passe aleatória em
`monitoring/runtime/initial-password.txt`, com permissões 600. Consultar o ficheiro
no editor local; não o copiar para chats ou logs. Substituir a palavra-passe na página **Gerir utilizadores** depois de entrar.
A recuperação pelo modo interativo continua disponível e exige reinício do
servidor; esse modo elimina o ficheiro inicial.
Não existe palavra-passe fixa no código ou no README.

A pasta `runtime/` fica fora do Git e do contexto Docker do portal. Contém
credenciais derivadas, acesso inicial temporário, logs técnicos, fila local de
alertas, métricas de IA e cópias de segurança. O serviço
recusa arrancar sem credenciais. Não disponibiliza esses ficheiros por HTTP.

O endereço é gerado a partir de `config/studio.json`, acrescentando `/ports/3004/`.
O servidor escuta apenas em `127.0.0.1`, atrás do HTTPS e da sessão SageMaker.
No Code Editor, abrir **Ports/Portas** (ou **View → Open View → Ports**) e
selecionar **Forward a Port/Encaminhar porta**, indicando `3004`. O proxy devolve
HTTP 400 enquanto essa porta não estiver encaminhada. Esta configuração é do
Code Editor e não é removida pelo login do painel.

O login do painel é adicional ao acesso Studio. Acesso HTTP direto não suporta
os cookies Secure da configuração normal: usar o endereço HTTPS anunciado.

## Gerir utilizadores na página

Entrar no painel e selecionar **Gerir utilizadores**, ou abrir `/users` no
caminho do monitoring. A conta da primeira versão é reconhecida como
**administrador**, mantendo o mesmo nome e palavra-passe. Na primeira alteração
administrativa guardada, o ficheiro local passa para o formato com várias contas,
sem guardar palavras-passe em texto simples.

A página permite:

- Criar contas de administrador ou leitor, com nome único sem distinguir
  maiúsculas/minúsculas, e palavra-passe de 12–128 caracteres confirmada.
- Alterar a palavra-passe, o perfil e o estado de uma conta.
- Desativar/reabilitar contas e remover outras contas com confirmação explícita.

Administradores gerem acessos; leitores apenas consultam o painel. A autorização
é verificada no servidor, mesmo que alguém tente enviar os formulários diretamente.
Todas as alterações exigem origem autorizada e token CSRF da sessão.

Alterar palavra-passe, perfil ou estado termina as sessões da conta afetada.
Ao alterar a própria palavra-passe ou perfil, é necessário entrar novamente.
Não é possível desativar/remover a conta em uso nem deixar de existir um
administrador ativo, incluindo com pedidos concorrentes. As alterações são
imediatas e persistem no reinício do serviço. Limite: 100 contas locais.

As palavras-passe existentes não podem ser consultadas. Para dar acesso a outra
pessoa, definir uma palavra-passe e transmiti-la por um canal privado próprio;
o painel não envia emails nem convites. As contas são exclusivas do monitoring
e não dão acesso ao portal ou a uma sessão SageMaker.

O comando `python -B -m monitoring.setup` passa a criar/recuperar o administrador
indicado, preservando as restantes contas. Usar com o serviço parado e reiniciar;
não executar recuperação CLI em paralelo com alterações na página. O ficheiro
local e as sessões em memória destinam-se a um único processo servidor.

Os ficheiros runtime tinham sido incluídos num commit anterior apesar da regra
de exclusão. Foram retirados do índice, mantendo cópias locais. Isso não apaga o
histórico Git: alterar a palavra-passe inicial se ainda estiver em uso. A alteração
da palavra-passe de `admin` elimina também o ficheiro inicial local, quando possível.

## Sinais operacionais e alertas

O portal e o agente escrevem eventos JSON-lines limitados a componente, operação,
resultado, duração, código técnico e contadores de tokens reportados. Não são
guardados prompts, respostas, corpos HTTP, nomes de clientes ou exceções completas.
O painel apresenta apenas agregados das últimas 24 horas.

O coletor transforma falhas em incidentes locais, deduplica estados repetidos e
regista uma recuperação quando a condição desaparece. A fila está em
`monitoring/runtime/notifications.jsonl`. O envio externo permanece desativado em
`monitoring/config.json`; ativá-lo exige escolher canal, destinatários e credenciais.

## Backups e ensaio de restauro

Para criar uma cópia local do catálogo SQLite, warehouse e itinerários e validar
imediatamente hashes, integridade SQLite e restauro num diretório temporário:

```bash
python -B -m monitoring.backup create-and-verify
```

Também é possível repetir a verificação sem alterar as fontes:

```bash
python -B -m monitoring.backup verify monitoring/runtime/backups/IDENTIFICADOR
```

O manifesto inclui hashes SHA-256 e tamanhos. A evidência mais recente fica em
`monitoring/runtime/restore-evidence.json` e alimenta o painel. Estas cópias são
locais ao mesmo ambiente; uma política de retenção e armazenamento externo ainda
tem de ser definida antes de produção.

## Cobertura

- Sondas a cada 30 segundos: portal `/catalog`, saúde Streamlit e apresentação.
- Agente opcional desativado por defeito; ativar `agent_enabled` só se estiver
  instalado e se se pretender verificar `/api/health`, sem chamar modelos.
- Leitura dos agregados de `manifest.json` e `validation_report.json` publicados.
- Espaço disponível, ocupação do disco e carga média do anfitrião.
- Até 240 amostras e 100 alterações de estado em memória, reiniciadas no arranque.
- Logs JSON-lines das sondas com rotação de 1 MB e três cópias; sem corpos de
  respostas, fontes, contactos, pedidos de clientes ou exceções detalhadas.
- Erros internos do portal, subprocessos e dependências em eventos reduzidos.
- Consumo de IA com chamadas, falhas, latência e tokens quando reportados.
- Incidentes deduplicados e recuperações numa fila local; sem envio externo.

`monitoring/config.json` define intervalo (10–300 segundos), agente e idade máxima
aceitável do warehouse em horas. `warehouse_max_age_hours: null` mostra cadência
por definir, sem inventar um SLA de atualização. Reiniciar para aplicar alterações.
A ocupação de disco a partir de 90% conta como incidente local preliminar, a rever
com a equipa. As contagens das tabelas incluem entidades de vários tipos; não
representam um total de clientes ou de experiências únicas.

O painel identifica recolha atrasada e perda de ligação. Um HTTP 200 não prova
prontidão funcional, acesso Bedrock ou um fluxo completo de curadoria. A validação
publicada não mostra tentativas ETL que falharam antes de substituir a entrega.
Tradução, memória e traces distribuídos continuam sem instrumentação. Tokens não
reportados pelo fornecedor aparecem como desconhecidos e nunca são estimados.

## Autenticação e fronteira de operação

- PBKDF2-HMAC-SHA256 com sal aleatório e 600 000 iterações; comparação constante.
- Sessões aleatórias no servidor, cookies HttpOnly/Secure/SameSite Strict limitados
  ao caminho do painel. Máximo oito horas e 30 minutos de inatividade.
- Logout invalida a sessão e exige token CSRF; POST exige a origem pública exata.
- Cinco tentativas falhadas por IP em cinco minutos. O proxy pode partilhar IP,
  pelo que o bloqueio pode afetar outros utilizadores; não confiar em headers
  de encaminhamento fornecidos pelo cliente.
- Sem acesso a URLs arbitrários, sem redirects nas sondas, sem endpoints de escrita
  operacional, sem listagem de diretórios ou entrega de ficheiros fora da whitelist.

Este servidor é para utilização interna no Studio. Uma exposição de produção
exige uma decisão de hosting, servidor/reverse proxy adequado, limites de tráfego,
identidade central e revisão operacional. Sessões e limitação de tentativas são
locais ao processo. Outros portais sob a mesma origem Studio não constituem uma
fronteira de segurança por domínio; para isolamento de produção, usar origem própria.
Se o próprio ambiente Studio cair, este monitor também deixa de recolher: uma sonda
externa independente é uma etapa posterior.

Referências de desenho: [sessões OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
e [armazenamento de palavras-passe](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Verificação

```bash
python -B -m unittest monitoring.test_monitoring -v
node monitoring/test-browser.mjs
```

O teste de navegador usa o Playwright já instalado no portal, credenciais de
fixture e servidor temporário em loopback, sem ler credenciais reais. Os testes
usam diretórios temporários e não modificam o catálogo nem o warehouse real.
