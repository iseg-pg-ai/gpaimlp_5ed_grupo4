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
no editor local; não o copiar para chats ou logs. Substituir as credenciais pelo
modo interativo e reiniciar o servidor; esse modo elimina o ficheiro inicial.
Não existe palavra-passe fixa no código ou no README.

A pasta `runtime/` fica fora do Git e do contexto Docker do portal. Contém apenas
credenciais derivadas, acesso inicial temporário e logs das sondas. O serviço
recusa arrancar sem credenciais. Não disponibiliza esses ficheiros por HTTP.

O endereço é gerado a partir de `config/studio.json`, acrescentando `/ports/3004/`.
O servidor escuta apenas em `127.0.0.1`, atrás do HTTPS e da sessão SageMaker.
No Code Editor, abrir **Ports/Portas** (ou **View → Open View → Ports**) e
selecionar **Forward a Port/Encaminhar porta**, indicando `3004`. O proxy devolve
HTTP 400 enquanto essa porta não estiver encaminhada. Esta configuração é do
Code Editor e não é removida pelo login do painel.

O login do painel é adicional ao acesso Studio. Acesso HTTP direto não suporta
os cookies Secure da configuração normal: usar o endereço HTTPS anunciado.

## Cobertura inicial

- Sondas a cada 30 segundos: portal `/catalog`, saúde Streamlit e apresentação.
- Agente opcional desativado por defeito; ativar `agent_enabled` só se estiver
  instalado e se se pretender verificar `/api/health`, sem chamar modelos.
- Leitura dos agregados de `manifest.json` e `validation_report.json` publicados.
- Espaço disponível, ocupação do disco e carga média do anfitrião.
- Até 240 amostras e 100 alterações de estado em memória, reiniciadas no arranque.
- Logs JSON-lines das sondas com rotação de 1 MB e três cópias; sem corpos de
  respostas, fontes, contactos, pedidos de clientes ou exceções detalhadas.
- Incidentes visíveis no painel; não envia notificações externas.

`monitoring/config.json` define intervalo (10–300 segundos), agente e idade máxima
aceitável do warehouse em horas. `warehouse_max_age_hours: null` mostra cadência
por definir, sem inventar um SLA de atualização. Reiniciar para aplicar alterações.
A ocupação de disco a partir de 90% conta como incidente local preliminar, a rever
com a equipa. As contagens das tabelas incluem entidades de vários tipos; não
representam um total de clientes ou de experiências únicas.

O painel identifica recolha atrasada e perda de ligação. Um HTTP 200 não prova
prontidão funcional, acesso Bedrock ou um fluxo completo de curadoria. A validação
publicada não mostra tentativas ETL que falharam antes de substituir a entrega.
Ainda não há instrumentação dos pedidos do portal, falhas de escrita, backups,
tradução, memória, tokens ou traces. Valores ausentes aparecem como desconhecidos.

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
