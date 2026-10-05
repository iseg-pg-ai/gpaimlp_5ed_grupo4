# DMC Workspace

O DMC Workspace é o portal local usado pelo consultor ou curador para recolher o
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
python -m uv sync --locked --group translation
python translations/setup_models.py
```

Os modelos são executados localmente. Não é necessário iniciar um serviço Python
separado nem fornecer credenciais externas.

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

A página `/catalog` permite pesquisar, filtrar, criar, editar e inativar
atividades, restaurantes e experiências. Os registos seguem os estados Rascunho,
Em revisão, Aprovado e Inativo. Apenas os aprovados podem entrar na geração.

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

## Exportação e versões

As versões são imutáveis e sequenciais por viagem. O armazenamento autoritativo é
`exports/itineraries/history.sqlite`; os PDFs e os JSON de suporte são também
materializados em `exports/itineraries/<id>/`. Esta pasta não pertence ao ETL nem
ao Git e deve ser incluída nos backups locais.

O painel reúne a versão atual, o idioma do cliente, a exportação e o histórico. A
exportação entrega português e o idioma escolhido no mesmo ZIP. Variantes
linguísticas pertencem à mesma versão e reutilizam os bytes já guardados.
Alterações posteriores ao catálogo não modificam snapshots ou PDFs antigos.

O orçamento discriminado apresenta preços calculáveis, valores por confirmar e
totais separados por moeda. O orçamento disponível do cliente aparece separado do
custo conhecido da proposta. Valores desconhecidos não são apresentados como zero.

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

O portal lê `../warehouse`, `../config` e, para o catálogo editável,
`../data/portal`. As viagens em edição também são mantidas no `localStorage` do
navegador. Não existe autenticação nem sincronização multiutilizador.

## Validação

Dentro de `dmc-workspace`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` acrescenta `format:check` a estas verificações e deve terminar sem
avisos antes de integrar alterações no portal.

Com o portal iniciado na porta 3001:

```powershell
npm run test:responsive
npm run test:navigation
npm run test:catalog
npm run test:confirmations
npm run test:itinerary
node tests/browser/briefing.mjs
node tests/browser/assistant.mjs
node tests/browser/delivery.mjs
```

No Windows, definir `$env:BROWSER_CHANNEL = "msedge"` quando o Chromium do
Playwright não estiver instalado.

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
