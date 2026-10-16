# DMC Workspace

Portal operacional da BLU Costa Travel para briefing, catálogo, geração e revisão
de itinerários, confirmação de atividades e exportação de propostas versionadas.

## Arranque

Executar primeiro o ETL na raiz do repositório. Depois, nesta pasta:

```powershell
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001).

No SageMaker, o modo de desenvolvimento também precisa do adaptador do proxy.
O comando `dev` seleciona-o automaticamente no Code Editor:

```bash
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws npm run dev -- -p 3001
```

O `package.json` substitui `fast-glob` por um adaptador local de `tinyglobby` apenas no plugin ESLint do
Next.js, removendo a cadeia vulnerável de `braces` (GHSA-vfj7-8cjw-p6xm), ainda
sem versão corrigida. Reavaliar este override quando o plugin remover essa
dependência. O aviso de descontinuação do ESLint 9 permanece: os plugins React
da configuração atual ainda não declaram compatibilidade com ESLint 10.

No SageMaker Code Editor, compilar e arrancar com Node.js 22.13 ou superior:

```bash
npm run build
npm run start:aws -- -p 3001
```

Para arrancar o portal e o agente de IA em conjunto, executar na raiz do projeto:

```bash
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws bash scripts/start_aws_portal.sh
```

O script usa o Node 22.13 instalado pelo NVM, inicia o agente se necessário e
compila o portal. O agente usa as credenciais do papel IAM do SageMaker para
aceder ao Bedrock; `BEDROCK_MODEL_ID` permite selecionar o modelo.
`BLU_AGENT_RELOAD=1` ativa recarregamento do agente durante desenvolvimento.

Os PDFs em chinês usam WenQuanYi Zen Hei ou Noto Sans CJK no Linux. Também é
possível indicar uma fonte através de `BLU_PDF_CJK_FONT` e a face de uma coleção
TTC através de `BLU_PDF_CJK_FACE`.

Abrir a porta 3001 através do Code Editor. O servidor AWS repõe o prefixo
`/codeeditor/default/ports/3001` removido pelo proxy, para que a navegação,
os recursos estáticos e os pedidos à API usem o mesmo caminho público.
Para outro caminho de proxy, definir `PORTAL_ASSET_PREFIX` com o mesmo valor
na compilação e no arranque.
Definir `PORTAL_PUBLIC_ORIGIN` no arranque com a origem HTTPS do Studio
(por exemplo, `https://<dominio>.studio.eu-west-1.sagemaker.aws`) para que
os redirecionamentos do Next.js conservem o endereço público através do proxy.

## Verificação

```powershell
npm run check
npm run build
```

Os testes de navegador exigem o portal iniciado na porta 3001.

## Documentação

Consulte o [guia completo do portal](../docs/PORTAL.md), o
[estado das funcionalidades](../docs/ARCHITECTURE.md) e o
[README principal](../README.md).
