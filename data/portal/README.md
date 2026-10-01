# Fonte editável do catálogo

O portal guarda nesta pasta `catalog.sqlite`: registos atuais e histórico de revisões.
A base é criada ao abrir Catálogo e importar a oferta existente como **Em revisão**.
Não editar o warehouse: criar e rever a oferta no portal e executar o ETL.

Esta base é local e não entra no Git. Com o portal e o ETL parados, copiar
`catalog.sqlite` para guardar uma cópia de segurança ou transportar o catálogo.
Consultar `README_UIMOCK.md` na raiz para o fluxo de aprovação e atualização.
