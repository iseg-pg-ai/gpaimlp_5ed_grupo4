# Guião de demonstração — questionário e assistente BLU

Revisto em 25 de outubro de 2026. Este guião usa o exemplo do botão
**Preencher exemplo** e a release de warehouse
`20261025T145638.707204Z-7fe9c7657cbd`. Os comandos usam os nomes visíveis dos
cartões; se o catálogo mudar, confirmar os nomes antes da apresentação.

## Objetivo da história

Apresentar o BLU como uma mesa de trabalho de curadoria: o questionário cria um
ponto de partida explicável, o assistente prepara alterações e o curador mantém
sempre a decisão final. A demonstração não deve parecer uma conversa livre que
edita dados sem controlo.

## Preparação

1. Abrir **Nova viagem** e carregar em **Preencher exemplo**.
2. Percorrer as cinco etapas sem alterar os campos.
3. Na revisão, gerar o itinerário.
4. Confirmar que aparecem seis dias, de 18 a 23 de maio de 2027.
5. Manter o painel do assistente visível e não aceitar uma proposta antes de
   mostrar a pré-visualização.

O exemplo representa Marta e Miguel, dois adultos numa viagem de aniversário
entre Lisboa e Porto. Têm um orçamento de referência de 4 800 EUR, ritmo
descontraído, interesse em património, gastronomia, vinhos e artesanato, e
excluem autocarros turísticos e lojas de recordações comerciais.

## Resultado inicial esperado

| Dia | Cidade | Seleção inicial |
| --- | --- | --- |
| 1 | Lisboa | Feira da Ladra; Time Out Market Lisboa |
| 2 | Lisboa | Canalha; Lisbon Market Tour & Cooking Class |
| 3 | Lisboa | Workshop de Doçaria Conventual; Pastelaria Alcoa |
| 4 | Porto | Mercado do Bolhão; Adega São Nicolau |
| 5 | Porto | Abadia do Porto; Escovaria de Belomonte |
| 6 | Porto | Centro Histórico e Ribeira; Taberna Santo António |

Os horários «Por agendar», preços de referência e verificações pendentes são
intencionais: permitem demonstrar que desconhecido não significa confirmado ou
gratuito.

## Guião falado e prompts

### 1. Explicar a origem do itinerário

**Dizer:** «Começamos por transformar o briefing num primeiro roteiro. O modelo
não inventa o catálogo: trabalha sobre opções aprovadas e mantém as incertezas.»

**Prompt:**

```text
Explica-me o itinerário atual e identifica possíveis problemas, sem fazer alterações.
```

**Mostrar:** a resposta é apenas leitura. Não deve surgir uma proposta aplicada.
Se o Nova Pro devolver uma resposta incompleta, o portal falha sem alterar nada;
essa é uma limitação conhecida e monitorizada.

### 2. Ajustar a capacidade de um dia

**Dizer:** «Um curador pode dar uma instrução operacional exata. Neste caso ela é
compilada localmente, sem custo de IA.»

**Prompt:**

```text
Define a capacidade do dia 2 para três atividades.
```

**Mostrar:** proposta estruturada, comparação antes/depois e botão de aceitação.
Aceitar para usar a nova capacidade nos passos seguintes.

### 3. Pedir recomendações sem aplicar

**Dizer:** «Agora usamos o modelo onde ele acrescenta valor: ordenar opções, não
tomar a decisão.»

**Prompt:**

```text
Com base no briefing, no itinerário atual e no catálogo aprovado, recomenda e ordena opções para acrescentar ao dia 2, sem aplicar alterações.
```

**Mostrar:** candidatos ordenados e respetivas razões. Escolher uma opção apenas
se for útil à narrativa; a escolha prepara outra proposta e continua a exigir
aceitação.

### 4. Reagendar uma atividade existente

**Prompt:**

```text
Reagenda Canalha do dia 2 para as 13:00.
```

**Mostrar:** apenas Canalha muda de horário. Os restantes cartões e dias ficam
iguais. Aceitar e atualizar a página para demonstrar persistência e histórico.

### 5. Preparar dados sem confirmar uma reserva

**Dizer:** «Preparar informação e confirmar uma reserva são ações diferentes.»

**Prompt:**

```text
Prepara o horário das 14:30 para a atividade Time Out Market Lisboa, sem confirmar a reserva.
```

**Mostrar:** o horário entra na confirmação pendente, mas o estado não passa a
confirmado e não são criados contactos ou referências.

### 6. Mover um cartão entre dias

**Prompt:**

```text
Move Pastelaria Alcoa do dia 3 para o dia 2.
```

**Mostrar:** Pastelaria Alcoa sai do dia 3 e entra no dia 2; não é simulada como
uma remoção e adição independentes. Aceitar apenas se a pré-visualização respeitar
a capacidade definida no passo 2.

### 7. Refinar uma proposta ainda não aplicada

Primeiro preparar, sem aceitar:

```text
Remove apenas Feira da Ladra do dia 1.
```

Depois escrever:

```text
Em vez de remover Feira da Ladra, remove Time Out Market Lisboa e mostra duas alternativas para Feira da Ladra sem aplicar nenhuma.
```

**Mostrar:** a nova proposta substitui a remoção anterior, remove apenas Time Out
Market Lisboa e apresenta alternativas informativas para Feira da Ladra. As
alternativas não entram no itinerário até existir uma escolha humana.

### 8. Demonstrar uma proteção

No portal, proteger explicitamente Feira da Ladra e depois usar:

```text
Remove Feira da Ladra, mesmo estando protegida.
```

**Mostrar:** plano vazio e aviso. A origem da última edição nunca substitui o
bloqueio explícito do curador.

### 9. Atualizar o briefing

**Prompt:**

```text
Aumenta o orçamento para 5200 EUR.
```

**Mostrar:** o orçamento muda no briefing apenas depois da aceitação. Explicar
que orçamento disponível não é uma cotação e que custos desconhecidos continuam
por confirmar.

### 10. Fechar com entrega supervisionada

**Prompt:**

```text
Prepara a exportação PDF em português, sem publicar nem enviar.
```

**Mostrar:** diagnóstico preventivo e preparação da entrega. A criação do PDF e
qualquer partilha continuam em controlos explícitos do portal.

## Plano curto para uma demonstração de cinco minutos

Se o tempo for limitado, executar apenas:

1. preencher e gerar o exemplo;
2. explicar o itinerário sem alterações;
3. definir a capacidade do dia 2;
4. pedir recomendações para o dia 2;
5. tentar remover uma atividade protegida;
6. mostrar histórico e preparação do PDF.

## Recuperação durante a apresentação

- Se uma resposta do modelo falhar, dizer: «O contrato recusou uma resposta
  incompleta; nada foi alterado» e continuar com um comando determinístico.
- Se existirem dois cartões com o mesmo nome, acrescentar o dia ao pedido. Se a
  ambiguidade persistir, copiar o ID do cartão atual e usá-lo no prompt.
- Se a sequência acumulada criar um conflito, rejeitar a proposta e continuar a
  partir da última versão guardada.
- Não usar nomes, emails ou notas reais de clientes durante a demonstração.
