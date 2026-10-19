# BLU | Curadoria de Roteiros

Plugin privado com workflow de roteiro visual e dependência da ligação Canva.
Recebe o TXT de uma versão guardada no DMC, sem acesso automático ao portal.

Versão do pacote-fonte: 0.4.0. Compatível com `blu-roteiro-canva/1.1.0` e `1.0.0`.

## Processo no DMC atualizado

1. Rever briefing, personalização, atividades, períodos livres e deslocações no DMC.
2. Exportar TXT da proposta atual, que guarda a versão, ou escolher uma versão
   no histórico e descarregar o TXT no idioma pretendido.
3. Restaurar primeiro versões no Lixo; alterações posteriores exigem um novo TXT.
4. Anexar o TXT ao plugin e conferir viagem, versão e hash antes da composição.
5. Rever conteúdo e todas as páginas da cópia Canva; aprovar e exportar o PDF.
6. Entregar o PDF Canva pelo canal escolhido pelo curador. A partilha integrada
   no DMC continua a entregar o PDF DMC, sem substituir artefactos históricos.

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

O prompt genérico de curadoria continua em `config/prompts/curadoria-blu.txt`.
Para o PDF visual, usar o TXT específico descarregado pelo botão
**Exportar TXT** na proposta ou no histórico do DMC.
O TXT inclui os dados do roteiro, idioma, versão, orçamento e pendências.
O modelo é https://canva.link/5u8zxudd1vkcbth; trabalhar sempre numa cópia.
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
Não alegar criação/exportação PDF sem resultado efetivo da ferramenta.
