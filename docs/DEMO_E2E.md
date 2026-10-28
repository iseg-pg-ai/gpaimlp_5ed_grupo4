# Demonstração de ponta a ponta — concierge, CRM e seguimento

Guião reutilizável para demonstrar a integração entre site, eventos AWS e
seguimento no portal. Usar dados fictícios e indicar se a sessão é real,
simulada ou apoiada por capturas datadas. Complementa a
[Parte III da apresentação](APRESENTACAO.md#4-parte-iii--demonstração-do-portal-real).

## Percurso demonstrado

```text
Site / concierge → Lambda de chat → resposta e contexto da viagem
        │ retenção autorizada
        ▼
API de eventos → SQS → processador → DynamoDB e arquivo S3
                                      │
Portal /leads ←────────────────────────┘
        └→ revisão humana, etiquetas, nota e estado de contacto
```

A pré-visualização local do site e o site CloudFront são entradas distintas.
Os endpoints públicos e a referência da conversa têm de pertencer ao ambiente
aprovado; uma referência `BLU-…` não autentica o visitante.

## Preparação

1. Confirmar o branch/commit e o ambiente aprovado, sem trocar de branch ou
   publicar recursos durante a demonstração.
2. Confirmar a sessão AWS com `aws sts get-caller-identity`. Usar a role/perfil
   já autorizado; não pressupor um perfil SSO de outra instalação.
3. Abrir o site do ambiente com `?demo=1` e confirmar **New conversation**.
   O modo demo marca eventos sintéticos, mas não desliga chamadas reais nem custos.
4. Confirmar `BLU_CONVERSATION_TABLE` e `BLU_INTELLIGENCE_TABLE` do mesmo
   ambiente no portal, com permissões Query/UpdateItem aprovadas.
5. Preparar uma conversa fictícia e confirmar que pode ser distinguida dos
   contactos comerciais. Não usar nomes, emails ou telefones de clientes.
6. Autorizar separadamente os efeitos de um ensaio real: inferência, eventos
   persistidos e eventual acesso aos canais externos.

Obter a URL do site e os nomes das tabelas dos outputs atuais da stack autorizada;
não copiar URLs de uma demo antiga. O contrato está em
[Arquitetura AWS](../infra/SPLIT_ARCHITECTURE.md).

## Guião

| Passo | Ação | Evidência a verificar |
| --- | --- | --- |
| 1 | Abrir **Talk to BLU** e escolher uma sugestão | Concierge abre e aceita o pedido |
| 2 | Pedir um destino fora de Portugal ou datas passadas | Resposta respeita o âmbito e pede esclarecimento, sem promessas |
| 3 | Completar destino, viajantes, datas e orçamento fictícios | Contexto é mantido; sugestões e Skip funcionam |
| 4 | Aceitar retenção em **Yes** | Consentimento e eventos sintéticos ficam identificados |
| 5 | Abrir Contactos no portal | Conversa de ensaio, contexto, campanha e consentimento correspondem |
| 6 | Etiquetar e escrever uma nota fictícia | Nota interna e estado são guardados sem envio ao visitante |
| 7 | Marcar como contactado | Estado muda; não é enviado email ou WhatsApp automaticamente |
| 8 | Usar **New conversation** durante ou após resposta | Nova referência, consentimento limpo e ausência de resposta antiga |

A narrativa é recolha supervisionada: o visitante autoriza retenção e o curador
decide o seguimento. Se o modelo violar o âmbito ou falhar, mostrar a limitação;
não tratar texto plausível como aprovação automática do caso.

## Verificação técnica

Numa sessão autorizada, consultar apenas o perfil da conversa sintética criada
no ensaio. Verificar `followUpStatus`, `followUpAt`, `journeyStage`, `journeyJson`,
`consentAt`, etiquetas e nota sem mostrar transcrições ou contactos reais.
A recusa de DescribeTable/DescribeStacks não prova, por si só, recusa de Query.
Não alargar IAM apenas para obter uma demonstração administrativa.

Os testes locais com mocks e os testes de infraestrutura estão em
[Testes](TESTING.md). Evidência desses testes não comprova que as stacks AWS
foram publicadas com a mesma revisão.

## Limites e alternativas

- RAG e avaliador diário dependem do deployment efetivo de Backoffice;
  confirmar a versão publicada em vez de assumir um estado histórico.
- WhatsApp exige número, segredo e webhook configurados; não enviar mensagens
  a terceiros para demonstrar apenas a abertura da ligação.
- O portal no Code Editor depende da sessão privada do Studio.
- Excluir sintéticos de indicadores reais e aplicar a retenção aprovada;
  não apagar registos em massa como parte do guião.
- Em falha Bedrock, demonstrar a degradação e o seguimento manual sem repetir
  chamadas pagas automaticamente.
- Capturas de apoio devem indicar data e origem e ser apresentadas como gravação,
  nunca como uma execução ao vivo.
