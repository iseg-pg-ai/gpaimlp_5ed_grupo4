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

## Dados sintéticos para testes

Para completar apenas campos vazios ou marcados como `Por confirmar`, primeiro
simular a operação:

```powershell
.\.venv\Scripts\python.exe scripts\seed_synthetic_catalog.py
```

Para criar uma cópia de segurança e aplicar os valores de demonstração:

```powershell
.\.venv\Scripts\python.exe scripts\seed_synthetic_catalog.py --apply --backup
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

Os valores gerados são determinísticos, ficam identificados como
`[DADO SINTÉTICO PARA TESTE]`, usam preços **Estimados** e criam uma nova revisão
no histórico. Dados existentes não são substituídos. O comando é idempotente:
uma segunda execução não cria revisões sem alterações.
