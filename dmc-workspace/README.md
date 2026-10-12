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

No SageMaker Code Editor, compilar e arrancar com Node.js 22.13 ou superior:

```bash
npm run build
npm run start:aws -- -p 3001
```

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
[estado das funcionalidades](../docs/STATUS.md) e o
[README principal](../README.md).
