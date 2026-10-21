# Catálogo editável local

O portal guarda nesta pasta o ficheiro `catalog.sqlite`, com os registos atuais e
o histórico de revisões. Num clone novo, `just blu it` cria a base a partir do
warehouse versionado e importa a oferta existente como **Em revisão**. Abrir
**Catálogo** também faz essa importação de forma idempotente.

Não editar o warehouse manualmente. A oferta deve ser criada, revista e aprovada
no portal e publicada através do ETL.

Esta base é local e não entra no Git. Com o portal e o ETL parados, copiar
`catalog.sqlite` para criar uma cópia de segurança ou transportar o catálogo.

Consultar o [guia do DMC Workspace](../../docs/PORTAL.md) para o fluxo de
aprovação e atualização.
