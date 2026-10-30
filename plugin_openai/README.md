# BLU | Curadoria de Roteiros

Plugin privado com workflow de roteiro visual e dependência da ligação Canva.
Recebe o TXT de uma versão guardada no DMC, sem acesso automático ao portal.

Versão do pacote-fonte: 0.4.6. Aceita qualquer versão ou identificador do TXT,
incluindo `blu-roteiro-prompt/*`, `blu-roteiro-canva/*` e texto sem JSON.
A composição depende dos dados legíveis do roteiro; a versão, por si só, nunca
justifica rejeitar o ficheiro ou exigir uma nova exportação.

## Processo no DMC atualizado

1. Rever briefing, personalização, atividades, períodos livres e deslocações no DMC.
2. Exportar TXT da proposta atual, que guarda a versão, ou escolher uma versão
   no histórico e descarregar o TXT no idioma pretendido.
3. Restaurar primeiro versões no Lixo; alterações posteriores exigem um novo TXT.
4. Anexar o TXT ao plugin e conferir os dados do roteiro e os metadados presentes.
   Metadados ausentes não são inventados nem impedem, por si só, a composição.
5. Rever conteúdo e todas as páginas da cópia Canva e concluir a gravação,
   obtendo a aprovação final quando exigida pela ferramenta.
6. Obter e verificar a ligação de edição da cópia final guardada. Entregar apenas
   essa ligação diretamente, sem pedir aprovação para criar/obter/enviar o link;
   nunca gerar, exportar ou entregar PDF através do plugin.

O contrato de entrega e recuperação está em
[roteiro-visual-canva](skills/roteiro-visual-canva/SKILL.md#contrato-de-entrega).
Se a ligação não puder ser recuperada, a entrega fica incompleta, com o bloqueio
identificado. A partilha e os PDFs históricos do DMC mantêm o seu fluxo próprio.

A integração Canva exige aprovação explícita das operações exatas antes de cada
chamada que altere a estrutura de páginas, incluindo adições. O plugin deve
agrupar essas operações quando possível e explicar o efeito na proposta, sem
pedir escolhas rotineiras de layout. A gravação final exige separadamente uma
pré-visualização legível da proposta completa e a aprovação do utilizador.
Estas exigências da ferramenta não podem ser removidas por instruções do plugin.
Não se aplicam a consultar o design e entregar a sua ligação editável.

A referência visual contém a auditoria de páginas reais do modelo e critérios
obrigatórios por página para tipografia, molduras fotográficas e informação ao
cliente. A capa mantém-se gráfica, sem foto; páginas de fotografia inteira e
páginas editoriais conservam as suas funções. Hashes e diagnósticos ficam internos.

As páginas de origem 2–13 ficam preservadas nas posições finais 2–13, em ordem,
sem alterações de conteúdo, imagens ou disposição. A única alteração nesse bloco
é a família tipográfica: todo o texto editável, no bloco e no restante documento,
deve usar **Libre Baskerville**. A parte da viagem começa após a página 13;
o índice original é preservado e não é usado como índice atualizado da viagem.
A integração atual não permite selecionar família em `format_text`: se não for
possível aplicar/verificar Libre Baskerville por um recurso suportado, o plugin
deve indicar a fonte pendente e continuar a compor todo o roteiro do TXT.
A entrega é **capa + páginas 2–13 preservadas + roteiro completo a partir de 14**;
a introdução nunca substitui o roteiro, nem como rascunho genérico. Conferir
cobertura entrada a entrada; páginas vazias não contam. Se apenas a fonte ficar
pendente, entregar o documento completo como rascunho tipográfico. Uma falha real
que impeça preencher conteúdo exige entrega incompleta com os dias/secções em falta.
Nunca gerar PDF.

O TXT preserva personalização estruturada, capacidade diária, períodos livres,
resumos de deslocações, moedas e pendências existentes na versão. A meteorologia
consultada em tempo real no portal não integra o snapshot. Contactos, email,
referências de reserva, necessidades livres do grupo e notas internas ficam fora.
O ficheiro contém o nome do cliente; não é anónimo.

## Conteúdo

- `plugin.json`: identidade e apresentação do plugin.
- `.app.json`: ligação Canva obrigatória, com identificador verificado.
- `skills/roteiro-visual-canva/SKILL.md`: workflow de composição do roteiro no Canva.
- `skills/roteiro-visual-canva/references/modelo-blu.md`: modelo e identidade visual.
- `skills/curadoria-blu/SKILL.md`: workflow e referência ao prompt.
- `skills/curadoria-blu/references/curadoria-blu.txt`: prompt completo.

A fonte única do prompt de curadoria é `skills/curadoria-blu/references/curadoria-blu.txt`.
Para a proposta editável no Canva, usar o TXT específico descarregado pelo botão
**Exportar TXT** na proposta ou no histórico do DMC.
O TXT inclui os dados do roteiro, idioma, versão, orçamento e pendências.
O modelo obrigatório é [LISBON IN PERSPECTIVE](https://www.canva.com/design/DAHDpPXVRsU/CMEjAPbbJUJ2nRzHHv97wA/edit),
ID `DAHDpPXVRsU`. Trabalhar numa cópia efetiva desse design, alterando apenas texto,
estrutura e fotografias e preservando a identidade visual. Não usar outro modelo
nem gerar uma alternativa. Se não for possível copiar/adaptar, indicar o bloqueio.
O pacote exportado é uma fotografia: alterações às instruções exigem reconstruir
e atualizar o plugin; alterações à viagem exigem apenas exportar um novo TXT.
O TXT isolado também pode ser usado como referência de
instruções num ambiente que permita essa configuração; anexá-lo a uma conversa
não instala um plugin.

Fornecer briefing e catálogo na conversa. O plugin não conhece automaticamente
os dados BLU e não substitui a revisão humana.

## Entrega

A revisão do pacote local não atualiza automaticamente a instalação 0.2.0 já
existente. Importar o novo ZIP num anfitrião compatível para adotar esta revisão.

O ZIP é um pacote preparado para importação num anfitrião compatível.
A ligação Canva é necessária para compor o documento. Este pacote não contém
credenciais nem um servidor MCP próprio. A criação de documentos pode consumir
créditos Canva, segundo a conta e as ferramentas utilizadas.
Verificar a ligação editável no anfitrião após a atualização da instalação.
