# Catálogo editável local

O portal guarda nesta pasta o ficheiro `catalog.sqlite`, com os registos atuais e
o histórico de revisões. A base é criada ao abrir **Catálogo** e importar a oferta
existente como **Em revisão**.

Não editar o warehouse manualmente. A oferta deve ser criada, revista e aprovada
no portal e publicada através do ETL.

Esta base é local e não entra no Git. Com o portal e o ETL parados, copiar
`catalog.sqlite` para criar uma cópia de segurança ou transportar o catálogo.

Consultar o [guia do DMC Workspace](../../docs/PORTAL.md) para o fluxo de
aprovação e atualização.
