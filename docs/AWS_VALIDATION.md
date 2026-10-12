# Portal AWS: correções e validação de 12 de outubro de 2026

Os bloqueios identificados na primeira auditoria foram corrigidos. A versão
atual passou todas as verificações locais e de integração descritas abaixo.
O acesso pelo proxy real continua a depender da sessão AWS do utilizador.

## Alterações

- Os 252 registos foram aprovados com autorização explícita do utilizador e
  publicados através do ETL. Cada aprovação criou uma revisão no catálogo.
  Duração e acessibilidade ausentes continuam assinaladas como `Por confirmar`.
  A cópia anterior está em
  `exports/backups/catalog-before-approval-20261012T215806Z.sqlite`.
- O agente utiliza as credenciais do papel IAM do SageMaker e
  `ChatBedrockConverse`, com suporte a ferramentas. A ausência de credenciais
  produz um erro explícito em vez de uma resposta fictícia.
- As partilhas usam a origem pública do Studio e o prefixo do portal. A
  validação de origem nas APIs de edição/publicação aceita a origem do Studio
  e continua a rejeitar origens externas.
- `eslint-config-next` foi alinhado com Next 16.4. Os testes Node 22 ativam o
  suporte a TypeScript. Os testes de browser usam Chromium por defeito.
- Os testes de assistente e adição usam os controlos atuais e aguardam a
  conclusão da atualização. O restauro testa uma viagem futura, porque uma
  viagem terminada não oferece o mesmo controlo de restauro.
- Os PDFs detetam fontes latinas e chinesas no Linux. Os testes verificam a
  estrutura PDF e o conteúdo da apresentação, sem um tamanho mínimo arbitrário.
- `scripts/start_aws_portal.sh` arranca o agente e o portal em conjunto e
  seleciona o Node 22.13 instalado pelo NVM. O agente só ativa reload quando
  `BLU_AGENT_RELOAD=1`.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `npm run check`: lint, tipos, formatação e testes | Passou |
| Testes unitários Node | 92 passaram; nenhum falhou ou foi ignorado |
| Testes Python: ETL e agente | 20 passaram |
| Compilação de produção | Passou |
| Baterias de browser | 12 passaram, incluindo os três fluxos antes pendentes |
| Integração real em armazenamento temporário | 16 verificações passaram |
| Proxy simulado, navegação e redirecionamento RSC | Passou na instância principal |
| Bedrock: chamada direta e endpoint de chat do agente | Respostas reais confirmadas |
| Ferramenta de pesquisa do catálogo do agente | Devolveu registos reais |
| Meteorologia pelo portal principal | HTTP 200, estado `available` |
| Catálogo na instância principal | 252 registos aprovados e publicados |
| Leitura independente dos PDFs PT/EN/ZH com pypdf | Três documentos com páginas e texto extraível |

As 16 verificações reais cobrem geração de dois dias de itinerário, gravação e
recarregamento de versão, PDF e ZIP em português, cinco traduções reais,
PDFs em inglês e chinês, partilha por documento e por link, origem dos pedidos
ao catálogo, envio de versão para o Lixo/restauro e disponibilidade do agente.

Os testes de interface cobrem navegação, briefing, catálogo, dataset, assistente,
confirmações, adição de oferta elegível, partilha, Lixo/restauro, recuperação do
workspace, apresentação do itinerário e responsividade. Navegação e catálogo
foram exercitados em seis idiomas; responsividade em cinco larguras e seis
idiomas. Algumas APIs são simuladas nesses testes de interface; as verificações
reais são executadas separadamente.

O teste de adição elegível foi repetido depois de substituir uma verificação
imediata pela espera da conclusão da atualização e do fecho do modal.

## Serviços e repetição

O portal principal está na porta 3001 e o agente na porta 8000. A cópia da porta
3002 usou `BLU_EXPORT_DIR=/tmp/portal-aws-fixed-validation` e foi encerrada após
os testes. As propostas existentes não foram usadas como dados de teste.

Na raiz do projeto:

```bash
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws bash scripts/start_aws_portal.sh
```

Na pasta `dmc-workspace`, com Node >=22.13 e <25:

```bash
npm run check
PORTAL_PUBLIC_ORIGIN=https://<dominio>.studio.eu-west-1.sagemaker.aws npm run test:aws
```

Em Linux, instalar fontes WenQuanYi Zen Hei ou Noto Sans CJK para PDFs chineses.
Também é possível configurar `BLU_PDF_CJK_FONT` e `BLU_PDF_CJK_FACE`.

Os logs desta execução estão em `/tmp/portal-fixed-check.log`,
`/tmp/portal-fixed-build.log`, `/tmp/portal-fixed-python-tests.log`,
`/tmp/portal-fixed-api.log`, `/tmp/portal-aws-api-results.json`,
`/tmp/portal-browser-results.json`, `/tmp/portal-fixed-eligible-retest.log`
e `/tmp/portal-fixed-proxy.log`.

## Limites da validação

A sessão autenticada do browser do utilizador não é acessível ao agente.
O teste específico do proxy reproduz remoção de prefixos e reescrita de
redirecionamentos, mas não substitui a verificação final no browser através
do SageMaker real. Partilhas alojadas no Studio continuam a exigir acesso AWS;
esta configuração não publica o portal para destinatários externos.

A aprovação do catálogo permite criar propostas preliminares. Não confirma
automaticamente disponibilidade, preços ou acessibilidade dos fornecedores.
