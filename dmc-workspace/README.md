# DMC Workspace

Portal operacional da BLU Costa Travel para briefing, catálogo, geração e revisão
de itinerários, confirmação de atividades e exportação de propostas versionadas.

## Arranque local

Publicar primeiro o warehouse conforme o [guia de dados](../docs/DATA_PIPELINE.md).
Depois, nesta pasta:

```bash
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001). O portal precisa de Node
>=22.13 e <25 e encontra o Python através de `BLU_PYTHON`, `../.venv` ou do
sistema. O agente de IA é opcional.

No SageMaker, preparar o ambiente pelo [onboarding](../docs/ONBOARDING.md)
e usar `./bin/just blu up` na raiz. O Space é descoberto dinamicamente.
Para diagnóstico isolado, com os caminhos de dados já preparados:

```bash
cd ..
bash scripts/start_aws_portal.sh
```

O proxy acrescenta `/codeeditor/default/ports/3001`; não reutilizar um build
criado para outro prefixo. A configuração completa está em
[Execução na AWS](../docs/PORTAL.md#execução-na-aws).

## Dependências e PDFs

`package.json` e `package-lock.json` definem as dependências Node. O override
local de `fast-glob` limita-se ao plugin ESLint do Next.js e deve ser reavaliado
quando essa cadeia tiver uma correção upstream.

Para PDFs em mandarim, configurar uma fonte CJK através de
`BLU_PDF_CJK_FONT` e, quando aplicável, `BLU_PDF_CJK_FACE`. No Linux podem ser
usadas WenQuanYi Zen Hei ou Noto Sans CJK.

## Verificação

```bash
npm run check
npm run build
```

Os testes de navegador exigem um servidor iniciado e aceitam `PORTAL_URL` e estão descritos
no [guia de testes](../docs/TESTING.md).

## Documentação

- [Funcionalidades e operação do portal](../docs/PORTAL.md)
- [Arquitetura e contratos](../docs/ARCHITECTURE.md)
- [Preparação do sistema](../README.md)
