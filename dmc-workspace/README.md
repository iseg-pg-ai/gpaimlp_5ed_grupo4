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
